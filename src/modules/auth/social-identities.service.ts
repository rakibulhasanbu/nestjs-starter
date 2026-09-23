import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service.js";
import type { AuthProvider } from "@/database/generated/prisma/enums.js";

@Injectable()
export class SocialIdentitiesService {
    constructor(private readonly prisma: PrismaService) {}

    findByProviderAccount(provider: AuthProvider, providerAccountId: string) {
        return this.prisma.socialIdentity.findUnique({
            where: { provider_providerAccountId: { provider, providerAccountId } },
            include: { user: true },
        });
    }

    findByUserAndProvider(userId: string, provider: AuthProvider) {
        return this.prisma.socialIdentity.findUnique({
            where: { userId_provider: { userId, provider } },
        });
    }

    link(userId: string, provider: AuthProvider, providerAccountId: string, email: string) {
        return this.prisma.socialIdentity.create({
            data: { userId, provider, providerAccountId, email },
        });
    }
}
