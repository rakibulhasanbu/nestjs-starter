import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import type { Env } from "@/config/env.schema.js";

export interface GoogleProfile {
    providerAccountId: string;
    email: string;
    emailVerified: boolean;
    name?: string;
}

/** Verifies Google ID tokens against our OAuth client — one provider per service, easy to add more later. */
@Injectable()
export class GoogleAuthService {
    private readonly client: OAuth2Client;

    constructor(private readonly configService: ConfigService<Env, true>) {
        this.client = new OAuth2Client(this.configService.get("GOOGLE_CLIENT_ID", { infer: true }));
    }

    async verifyIdToken(idToken: string): Promise<GoogleProfile> {
        let ticket;
        try {
            ticket = await this.client.verifyIdToken({
                idToken,
                audience: this.configService.get("GOOGLE_CLIENT_ID", { infer: true }),
            });
        } catch {
            throw new UnauthorizedException("Invalid Google token");
        }

        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email) {
            throw new UnauthorizedException("Invalid Google token");
        }

        return {
            providerAccountId: payload.sub,
            email: payload.email,
            emailVerified: payload.email_verified ?? false,
            name: payload.name,
        };
    }
}
