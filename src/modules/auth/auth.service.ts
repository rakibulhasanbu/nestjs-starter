import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { resolveDeviceInfo } from "@/common/utils/device.util.js";
import type { Env } from "@/config/env.schema.js";
import { AuthProvider, EmailTokenType, Role, UserStatus } from "@/database/generated/prisma/enums.js";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { EMAIL_SENDER, type EmailSender } from "@/integrations/email/email-sender.interface.js";
import { EmailTokensService } from "@/modules/auth/email-tokens.service.js";
import { GoogleAuthService } from "@/modules/auth/google-auth.service.js";
import { SocialIdentitiesService } from "@/modules/auth/social-identities.service.js";
import { WebauthnService } from "@/modules/auth/webauthn.service.js";
import { WebauthnCredentialsService } from "@/modules/auth/webauthn-credentials.service.js";
import type { SignupInput } from "@/modules/auth/dto/signup.schema.js";
import type { SigninInput } from "@/modules/auth/dto/signin.schema.js";
import { TokensService } from "@/modules/auth/tokens.service.js";
import { UsersService } from "@/modules/users/users.service.js";
import { toPublicUser, type PublicUser } from "@/modules/users/users.mapper.js";

export interface LoginContext {
    userAgent?: string;
    ipAddress?: string;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly tokensService: TokensService,
        private readonly emailTokensService: EmailTokensService,
        private readonly socialIdentitiesService: SocialIdentitiesService,
        private readonly googleAuthService: GoogleAuthService,
        private readonly webauthnService: WebauthnService,
        private readonly webauthnCredentialsService: WebauthnCredentialsService,
        private readonly configService: ConfigService<Env, true>,
        @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    ) {}

    async signup(input: SignupInput): Promise<{ user: PublicUser }> {
        const existing = await this.usersService.findByEmail(input.email);
        if (existing) {
            throw new ConflictException("An account with this email already exists");
        }

        const passwordHash = await argon2.hash(input.password);
        const user = await this.usersService.createUser({
            email: input.email,
            passwordHash,
            name: input.name,
        });

        await this.sendVerificationEmail(user.id, user.email);

        return { user: toPublicUser(user) };
    }

    async signin(input: SigninInput, context: LoginContext) {
        const user = await this.usersService.findByEmail(input.email);
        if (!user || user.deletedAt) {
            throw new UnauthorizedException("Invalid email or password");
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new UnauthorizedException("Account temporarily locked due to too many failed attempts");
        }

        if (user.status === UserStatus.SUSPENDED) {
            throw new UnauthorizedException("This account has been suspended");
        }

        if (!user.password) {
            throw new UnauthorizedException(
                "This account signs in with Google — set a password from account settings to use this method",
            );
        }

        const passwordValid = await argon2.verify(user.password, input.password);
        if (!passwordValid) {
            await this.usersService.recordFailedLogin(
                user.id,
                this.configService.get("LOGIN_MAX_ATTEMPTS", { infer: true }),
                this.configService.get("LOGIN_LOCKOUT_MINUTES", { infer: true }),
            );
            throw new UnauthorizedException("Invalid email or password");
        }

        if (user.status === UserStatus.PENDING_VERIFICATION) {
            await this.sendVerificationEmail(user.id, user.email);
            throw new UnauthorizedException({
                code: "EMAIL_NOT_VERIFIED",
                message: "Please verify your email before logging in",
            });
        }

        await this.usersService.resetFailedLogin(user.id);

        return this.issueSession(user.id, user.email, user.role, context, {
            deviceType: input.deviceType,
            deviceName: input.deviceName,
        });
    }

    async refresh(
        rawRefreshToken: string,
        context: LoginContext,
        explicitDevice?: { deviceType?: string; deviceName?: string },
    ) {
        const record = await this.tokensService.consumeRefreshToken(rawRefreshToken);
        if (!record || record.user.deletedAt || record.user.status !== UserStatus.ACTIVE) {
            throw new UnauthorizedException("Invalid or expired refresh token");
        }

        return this.issueSession(record.user.id, record.user.email, record.user.role, context, explicitDevice);
    }

    async logout(rawRefreshToken: string): Promise<void> {
        await this.tokensService.revokeRefreshToken(rawRefreshToken);
    }

    /** Verifying implies the user just proved control of the account, so it also signs them in. */
    async verifyEmail(
        email: string,
        code: string,
        context: LoginContext,
        explicitDevice?: { deviceType?: string; deviceName?: string },
    ) {
        const user = await this.usersService.findByEmail(email);
        if (!user || !(await this.emailTokensService.consume(user.id, EmailTokenType.VERIFY_EMAIL, code))) {
            throw new BadRequestException("Invalid or expired verification code");
        }
        await this.usersService.markEmailVerified(user.id);
        return this.issueSession(user.id, user.email, user.role, context, explicitDevice);
    }

    async resendVerification(email: string): Promise<void> {
        const user = await this.usersService.findByEmail(email);
        if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
            return; // don't reveal whether the account exists
        }
        await this.sendVerificationEmail(user.id, user.email);
    }

    async forgotPassword(email: string): Promise<void> {
        const user = await this.usersService.findByEmail(email);
        if (!user || user.deletedAt) {
            return; // don't reveal whether the account exists
        }

        const code = await this.emailTokensService.issueResetPasswordToken(user.id);
        if (code) {
            await this.emailSender.sendResetPassword({ to: user.email, code });
        }
    }

    /**
     * Also used for the admin-invite flow: an invited admin has no password
     * yet, so completing this reset both sets their password and verifies
     * the account (proving ownership of the invited email address).
     *
     * Consuming the code proves account ownership, so this also signs the user in.
     */
    async resetPassword(
        email: string,
        code: string,
        newPassword: string,
        context: LoginContext,
        explicitDevice?: { deviceType?: string; deviceName?: string },
    ) {
        const user = await this.usersService.findByEmail(email);
        if (!user || !(await this.emailTokensService.consume(user.id, EmailTokenType.RESET_PASSWORD, code))) {
            throw new BadRequestException("Invalid or expired reset code");
        }

        const passwordHash = await argon2.hash(newPassword);
        await this.usersService.setPassword(user.id, passwordHash);
        await this.usersService.markEmailVerified(user.id);
        await this.tokensService.revokeAllRefreshTokens(user.id);
        return this.issueSession(user.id, user.email, user.role, context, explicitDevice);
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.usersService.findById(userId);
        if (!user || user.deletedAt) {
            throw new UnauthorizedException("Invalid credentials");
        }

        if (!user.password) {
            throw new BadRequestException("No password set yet — use the set-password endpoint instead");
        }

        const passwordValid = await argon2.verify(user.password, currentPassword);
        if (!passwordValid) {
            throw new UnauthorizedException("Current password is incorrect");
        }

        const isSamePassword = await argon2.verify(user.password, newPassword);
        if (isSamePassword) {
            throw new BadRequestException("New password must be different from the current password");
        }

        const passwordHash = await argon2.hash(newPassword);
        await this.usersService.setPassword(userId, passwordHash);
        await this.tokensService.revokeAllRefreshTokens(userId);
    }

    /** For social-only accounts (no password yet) to add password login as a second method. */
    async setPassword(userId: string, newPassword: string): Promise<void> {
        const user = await this.usersService.findById(userId);
        if (!user || user.deletedAt) {
            throw new UnauthorizedException("Invalid credentials");
        }

        if (user.password) {
            throw new BadRequestException("Password already set — use change-password instead");
        }

        const passwordHash = await argon2.hash(newPassword);
        await this.usersService.setPassword(userId, passwordHash);
    }

    async loginWithGoogle(idToken: string, context: LoginContext) {
        const profile = await this.googleAuthService.verifyIdToken(idToken);
        if (!profile.emailVerified) {
            throw new UnauthorizedException("Google account email is not verified");
        }

        const identity = await this.socialIdentitiesService.findByProviderAccount(
            AuthProvider.GOOGLE,
            profile.providerAccountId,
        );

        const user = identity ? identity.user : await this.linkOrCreateGoogleUser(profile);

        if (user.deletedAt || user.status === UserStatus.SUSPENDED) {
            throw new UnauthorizedException("This account is not available");
        }

        return this.issueSession(user.id, user.email, user.role, context);
    }

    private async linkOrCreateGoogleUser(profile: { providerAccountId: string; email: string; name?: string }) {
        const existingUser = await this.usersService.findByEmail(profile.email);

        if (existingUser) {
            await this.socialIdentitiesService.link(
                existingUser.id,
                AuthProvider.GOOGLE,
                profile.providerAccountId,
                profile.email,
            );
            if (!existingUser.emailVerifiedAt) {
                await this.usersService.markEmailVerified(existingUser.id);
            }
            await this.emailSender.sendAccountLinked({ to: existingUser.email, provider: "Google" });
            return existingUser;
        }

        const user = await this.usersService.createUser({
            email: profile.email,
            name: profile.name,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
        });
        await this.socialIdentitiesService.link(user.id, AuthProvider.GOOGLE, profile.providerAccountId, profile.email);
        return user;
    }

    async listSessions(userId: string) {
        const sessions = await this.tokensService.listActiveSessions(userId);
        return sessions.map(({ tokenHash: _tokenHash, ...session }) => session);
    }

    async revokeSession(userId: string, sessionId: string): Promise<void> {
        await this.tokensService.revokeSessionById(userId, sessionId);
    }

    async revokeAllSessions(userId: string): Promise<void> {
        await this.tokensService.revokeAllRefreshTokens(userId);
    }

    async inviteAdmin(email: string): Promise<PublicUser> {
        const existing = await this.usersService.findByEmail(email);
        if (existing) {
            throw new ConflictException("An account with this email already exists");
        }

        const placeholderPassword = await argon2.hash(randomUUID());
        const user = await this.usersService.createUser({
            email,
            passwordHash: placeholderPassword,
            role: Role.ADMIN,
        });

        const code = await this.emailTokensService.issueResetPasswordToken(user.id);
        if (code) {
            await this.emailSender.sendResetPassword({ to: user.email, code });
        }

        return toPublicUser(user);
    }

    /** Only logged-in users can register a passkey — it's added to an existing account, not used to create one. */
    async getWebauthnRegistrationOptions(userId: string) {
        const user = await this.usersService.findById(userId);
        if (!user || user.deletedAt) {
            throw new UnauthorizedException("Invalid credentials");
        }
        return this.webauthnService.createRegistrationOptions(user);
    }

    async verifyWebauthnRegistration(
        userId: string,
        credential: RegistrationResponseJSON,
        deviceName?: string,
    ): Promise<void> {
        await this.webauthnService.verifyRegistration(userId, credential, deviceName);
    }

    async getWebauthnLoginOptions(email: string) {
        const user = await this.usersService.findByEmail(email);
        if (!user || user.deletedAt) {
            throw new UnauthorizedException("No passkeys registered for this account");
        }
        return this.webauthnService.createAuthenticationOptions(user.id);
    }

    async loginWithWebauthn(email: string, credential: AuthenticationResponseJSON, context: LoginContext) {
        const user = await this.usersService.findByEmail(email);
        if (!user || user.deletedAt || user.status === UserStatus.SUSPENDED) {
            throw new UnauthorizedException("This account is not available");
        }

        await this.webauthnService.verifyAuthentication(user.id, credential);

        return this.issueSession(user.id, user.email, user.role, context);
    }

    async listWebauthnCredentials(userId: string) {
        const credentials = await this.webauthnCredentialsService.listByUserId(userId);
        return credentials.map(({ publicKey: _publicKey, counter: _counter, ...credential }) => credential);
    }

    async removeWebauthnCredential(userId: string, credentialId: string): Promise<void> {
        await this.webauthnCredentialsService.remove(userId, credentialId);
    }

    private async sendVerificationEmail(userId: string, email: string): Promise<void> {
        const code = await this.emailTokensService.issueVerifyEmailToken(userId);
        if (code) {
            await this.emailSender.sendVerifyEmail({ to: email, code });
        }
    }

    private async issueSession(
        userId: string,
        email: string,
        role: Role,
        context: LoginContext,
        explicitDevice?: { deviceType?: string; deviceName?: string },
    ) {
        const accessToken = this.tokensService.signAccessToken({ sub: userId, email, role });
        const device = resolveDeviceInfo(context.userAgent, explicitDevice);
        const refreshToken = await this.tokensService.issueRefreshToken(userId, {
            userAgent: context.userAgent,
            ipAddress: context.ipAddress,
            device,
        });

        return { accessToken, refreshToken };
    }
}
