import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Env } from "@/config/env.schema.js";
import type { AccessTokenPayload } from "@/modules/auth/tokens.service.js";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(configService: ConfigService<Env, true>) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get("JWT_ACCESS_SECRET", { infer: true }),
        });
    }

    validate(payload: AccessTokenPayload) {
        return { id: payload.sub, email: payload.email, role: payload.role };
    }
}
