import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
    type AuthenticationResponseJSON,
    type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Env } from "@/config/env.schema.js";
import { PrismaService } from "@/database/prisma.service.js";
import { WebauthnCredentialsService } from "@/modules/auth/webauthn-credentials.service.js";

@Injectable()
export class WebauthnService {
    constructor(
        private readonly webauthnCredentials: WebauthnCredentialsService,
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    async createRegistrationOptions(user: { id: string; email: string; name?: string | null }) {
        const existing = await this.webauthnCredentials.listByUserId(user.id);

        const options = await generateRegistrationOptions({
            rpName: this.configService.get("WEBAUTHN_RP_NAME", { infer: true }),
            rpID: this.configService.get("WEBAUTHN_RP_ID", { infer: true }),
            userID: new TextEncoder().encode(user.id),
            userName: user.email,
            userDisplayName: user.name ?? user.email,
            attestationType: "none",
            excludeCredentials: existing.map(credential => ({
                id: credential.credentialId,
                transports: credential.transports as never,
            })),
            authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        });

        await this.storeChallenge(user.id, options.challenge, "registration");
        return options;
    }

    async verifyRegistration(userId: string, credential: RegistrationResponseJSON, deviceName?: string): Promise<void> {
        const challenge = await this.consumeChallenge(userId, "registration");
        if (!challenge) {
            throw new BadRequestException("Registration challenge expired — please try again");
        }

        const verification = await verifyRegistrationResponse({
            response: credential,
            expectedChallenge: challenge,
            expectedOrigin: this.configService.get("WEBAUTHN_ORIGIN", { infer: true }),
            expectedRPID: this.configService.get("WEBAUTHN_RP_ID", { infer: true }),
        });

        if (!verification.verified || !verification.registrationInfo) {
            throw new BadRequestException("Passkey registration could not be verified");
        }

        const { credential: verified } = verification.registrationInfo;
        await this.webauthnCredentials.save({
            userId,
            credentialId: verified.id,
            publicKey: verified.publicKey,
            counter: verified.counter,
            transports: verified.transports,
            deviceName,
        });
    }

    async createAuthenticationOptions(userId: string) {
        const credentials = await this.webauthnCredentials.listByUserId(userId);
        if (credentials.length === 0) {
            throw new UnauthorizedException("No passkeys registered for this account");
        }

        const options = await generateAuthenticationOptions({
            rpID: this.configService.get("WEBAUTHN_RP_ID", { infer: true }),
            allowCredentials: credentials.map(credential => ({
                id: credential.credentialId,
                transports: credential.transports as never,
            })),
            userVerification: "preferred",
        });

        await this.storeChallenge(userId, options.challenge, "authentication");
        return options;
    }

    /** Verifies the assertion and bumps the stored counter — throws if the credential doesn't belong to userId. */
    async verifyAuthentication(userId: string, credential: AuthenticationResponseJSON): Promise<void> {
        const challenge = await this.consumeChallenge(userId, "authentication");
        if (!challenge) {
            throw new UnauthorizedException("Authentication challenge expired — please try again");
        }

        const stored = await this.webauthnCredentials.findByCredentialId(credential.id);
        if (!stored || stored.userId !== userId) {
            throw new UnauthorizedException("Passkey not recognized");
        }

        await this.assertCredential(credential, stored, challenge);
    }

    /** No email needed — the platform authenticator resolves which discoverable credential/account to use. */
    async createUsernamelessAuthenticationOptions() {
        const options = await generateAuthenticationOptions({
            rpID: this.configService.get("WEBAUTHN_RP_ID", { infer: true }),
            allowCredentials: [],
            userVerification: "required",
        });

        await this.storeChallenge(null, options.challenge, "authentication");
        return options;
    }

    /** Resolves the user from the credential id in the assertion itself — returns the userId to the caller. */
    async verifyUsernamelessAuthentication(credential: AuthenticationResponseJSON): Promise<{ userId: string }> {
        const challengeValue = this.decodeAssertionChallenge(credential);
        const challenge = await this.consumeChallengeByValue(challengeValue, "authentication");
        if (!challenge) {
            throw new UnauthorizedException("Authentication challenge expired — please try again");
        }

        const stored = await this.webauthnCredentials.findByCredentialId(credential.id);
        if (!stored) {
            throw new UnauthorizedException("Passkey not recognized");
        }

        await this.assertCredential(credential, stored, challenge);
        return { userId: stored.userId };
    }

    private async assertCredential(
        credential: AuthenticationResponseJSON,
        stored: { id: string; credentialId: string; publicKey: Uint8Array; counter: bigint; transports: string[] },
        challenge: string,
    ): Promise<void> {
        const verification = await verifyAuthenticationResponse({
            response: credential,
            expectedChallenge: challenge,
            expectedOrigin: this.configService.get("WEBAUTHN_ORIGIN", { infer: true }),
            expectedRPID: this.configService.get("WEBAUTHN_RP_ID", { infer: true }),
            credential: {
                id: stored.credentialId,
                publicKey: new Uint8Array(stored.publicKey),
                counter: Number(stored.counter),
                transports: stored.transports as never,
            },
        });

        if (!verification.verified) {
            throw new UnauthorizedException("Passkey verification failed");
        }

        await this.webauthnCredentials.updateCounter(stored.id, verification.authenticationInfo.newCounter);
    }

    private decodeAssertionChallenge(credential: AuthenticationResponseJSON): string {
        const clientDataJSON = JSON.parse(
            Buffer.from(credential.response.clientDataJSON, "base64url").toString("utf8"),
        ) as { challenge: string };
        return clientDataJSON.challenge;
    }

    /** One active challenge per user/type — a fresh options call invalidates any earlier, unfinished attempt.
     *  A null userId (usernameless flow) skips invalidation since many anonymous attempts can be in flight at once. */
    private async storeChallenge(userId: string | null, challenge: string, type: "registration" | "authentication") {
        const ttlMinutes = this.configService.get("WEBAUTHN_CHALLENGE_TTL_MINUTES", { infer: true });
        if (userId) {
            await this.prisma.webauthnChallenge.deleteMany({ where: { userId, type } });
        }
        await this.prisma.webauthnChallenge.create({
            data: { userId, challenge, type, expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000) },
        });
    }

    private async consumeChallenge(userId: string, type: "registration" | "authentication"): Promise<string | null> {
        const record = await this.prisma.webauthnChallenge.findFirst({
            where: { userId, type },
            orderBy: { createdAt: "desc" },
        });

        if (!record || record.expiresAt < new Date()) {
            return null;
        }

        await this.prisma.webauthnChallenge.delete({ where: { id: record.id } });
        return record.challenge;
    }

    private async consumeChallengeByValue(
        challenge: string,
        type: "registration" | "authentication",
    ): Promise<string | null> {
        const record = await this.prisma.webauthnChallenge.findUnique({ where: { challenge } });

        if (!record || record.type !== type || record.expiresAt < new Date()) {
            return null;
        }

        await this.prisma.webauthnChallenge.delete({ where: { id: record.id } });
        return record.challenge;
    }
}
