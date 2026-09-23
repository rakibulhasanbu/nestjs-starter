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

    /**
     * Returns the raw claims untouched. Roles and permissions are resolved from
     * the database by PermissionsGuard, which also verifies the version markers —
     * this strategy only proves the token's signature and expiry.
     */
    validate(payload: AccessTokenPayload): AccessTokenPayload {
        return payload;
    }
}
