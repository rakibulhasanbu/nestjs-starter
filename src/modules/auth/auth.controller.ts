import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser } from "@/common/decorators/current-user.decorator.js";
import { Public } from "@/common/decorators/public.decorator.js";
import type { AuthenticatedUser } from "@/common/types/authenticated-request.type.js";
import { AuthService } from "@/modules/auth/auth.service.js";
import { RegisterDto } from "@/modules/auth/dto/register.schema.js";
import { LoginDto } from "@/modules/auth/dto/login.schema.js";
import { RefreshTokenDto } from "@/modules/auth/dto/refresh-token.schema.js";
import { LogoutDto } from "@/modules/auth/dto/logout.schema.js";
import { VerifyEmailDto, ResendVerificationDto } from "@/modules/auth/dto/verify-email.schema.js";
import { ForgotPasswordDto } from "@/modules/auth/dto/forgot-password.schema.js";
import { ResetPasswordDto } from "@/modules/auth/dto/reset-password.schema.js";
import { ChangePasswordDto } from "@/modules/auth/dto/change-password.schema.js";
import { GoogleLoginDto } from "@/modules/auth/dto/google-login.schema.js";
import { SetPasswordDto } from "@/modules/auth/dto/set-password.schema.js";

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @Post("register")
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    @Post("login")
    login(@Body() dto: LoginDto, @Req() req: Request) {
        return this.authService.login(dto, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
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
    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("verify-email")
    async verifyEmail(@Body() dto: VerifyEmailDto) {
        await this.authService.verifyEmail(dto.token);
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
    @HttpCode(HttpStatus.NO_CONTENT)
    @Post("reset-password")
    async resetPassword(@Body() dto: ResetPasswordDto) {
        await this.authService.resetPassword(dto.token, dto.password);
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
}
