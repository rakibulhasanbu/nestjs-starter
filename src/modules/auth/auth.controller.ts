import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser } from "@/common/decorators/current-user.decorator.js";
import { Public } from "@/common/decorators/public.decorator.js";
import type { AuthenticatedUser } from "@/common/types/authenticated-request.type.js";
import { AuthService } from "@/modules/auth/auth.service.js";
import { SignupDto } from "@/modules/auth/dto/signup.schema.js";
import { SigninDto } from "@/modules/auth/dto/signin.schema.js";
import { RefreshTokenDto } from "@/modules/auth/dto/refresh-token.schema.js";
import { LogoutDto } from "@/modules/auth/dto/logout.schema.js";
import { VerifyEmailDto, ResendVerificationDto } from "@/modules/auth/dto/verify-email.schema.js";
import { ForgotPasswordDto } from "@/modules/auth/dto/forgot-password.schema.js";
import { ResetPasswordDto } from "@/modules/auth/dto/reset-password.schema.js";
import { ChangePasswordDto } from "@/modules/auth/dto/change-password.schema.js";
import { GoogleLoginDto } from "@/modules/auth/dto/google-login.schema.js";
import { SetPasswordDto } from "@/modules/auth/dto/set-password.schema.js";
import { WebauthnRegisterVerifyDto } from "@/modules/auth/dto/webauthn-register-verify.schema.js";
import { WebauthnLoginOptionsDto } from "@/modules/auth/dto/webauthn-login-options.schema.js";
import { WebauthnLoginVerifyDto } from "@/modules/auth/dto/webauthn-login-verify.schema.js";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @Post("signup")
    signup(@Body() dto: SignupDto) {
        return this.authService.signup(dto);
    }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    @Post("signin")
    signin(@Body() dto: SigninDto, @Req() req: Request) {
        return this.authService.signin(dto, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
    }

    @Public()
    @HttpCode(HttpStatus.OK)
    @Post("refresh")
    refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
        return this.authService.refresh(
            dto.refreshToken,
            { userAgent: req.headers["user-agent"], ipAddress: req.ip },
            { deviceType: dto.deviceType, deviceName: dto.deviceName },
        );
    }

    @Public()
    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("logout")
    async logout(@Body() dto: LogoutDto) {
        await this.authService.logout(dto.refreshToken);
    }

    @Public()
    @HttpCode(HttpStatus.OK)
    @Post("verify-email")
    verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
        return this.authService.verifyEmail(dto.email, dto.code, {
            userAgent: req.headers["user-agent"],
            ipAddress: req.ip,
        });
    }

    @Public()
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("resend-verification")
    async resendVerification(@Body() dto: ResendVerificationDto) {
        await this.authService.resendVerification(dto.email);
    }

    @Public()
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("forgot-password")
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        await this.authService.forgotPassword(dto.email);
    }

    @Public()
    @HttpCode(HttpStatus.OK)
    @Post("reset-password")
    resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
        return this.authService.resetPassword(dto.email, dto.code, dto.password, {
            userAgent: req.headers["user-agent"],
            ipAddress: req.ip,
        });
    }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    @Post("google")
    googleLogin(@Body() dto: GoogleLoginDto, @Req() req: Request) {
        return this.authService.loginWithGoogle(dto.idToken, {
            userAgent: req.headers["user-agent"],
            ipAddress: req.ip,
        });
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("set-password")
    async setPassword(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: SetPasswordDto) {
        await this.authService.setPassword(currentUser.id, dto.newPassword);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("change-password")
    async changePassword(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
        await this.authService.changePassword(currentUser.id, dto.currentPassword, dto.newPassword);
    }

    @Get("sessions")
    listSessions(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.authService.listSessions(currentUser.id);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete("sessions/:sessionId")
    revokeSession(@CurrentUser() currentUser: AuthenticatedUser, @Param("sessionId") sessionId: string) {
        return this.authService.revokeSession(currentUser.id, sessionId);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete("sessions")
    revokeAllSessions(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.authService.revokeAllSessions(currentUser.id);
    }

    @HttpCode(HttpStatus.OK)
    @Post("webauthn/register/options")
    getWebauthnRegistrationOptions(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.authService.getWebauthnRegistrationOptions(currentUser.id);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("webauthn/register/verify")
    async verifyWebauthnRegistration(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Body() dto: WebauthnRegisterVerifyDto,
    ) {
        await this.authService.verifyWebauthnRegistration(
            currentUser.id,
            dto.credential as unknown as RegistrationResponseJSON,
            dto.deviceName,
        );
    }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    @Post("webauthn/login/options")
    getWebauthnLoginOptions(@Body() dto: WebauthnLoginOptionsDto) {
        return this.authService.getWebauthnLoginOptions(dto.email);
    }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    @Post("webauthn/login/verify")
    loginWithWebauthn(@Body() dto: WebauthnLoginVerifyDto, @Req() req: Request) {
        return this.authService.loginWithWebauthn(dto.email, dto.credential as unknown as AuthenticationResponseJSON, {
            userAgent: req.headers["user-agent"],
            ipAddress: req.ip,
        });
    }

    @Get("webauthn/credentials")
    listWebauthnCredentials(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.authService.listWebauthnCredentials(currentUser.id);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete("webauthn/credentials/:credentialId")
    removeWebauthnCredential(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Param("credentialId") credentialId: string,
    ) {
        return this.authService.removeWebauthnCredential(currentUser.id, credentialId);
    }
}
