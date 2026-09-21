import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service.js";

@Injectable()
export class WebauthnCredentialsService {
    constructor(private readonly prisma: PrismaService) {}

    findByCredentialId(credentialId: string) {
        return this.prisma.webauthnCredential.findUnique({
            where: { credentialId },
            include: { user: true },
        });
    }

    listByUserId(userId: string) {
        return this.prisma.webauthnCredential.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });
    }

    save(params: {
        userId: string;
        credentialId: string;
        publicKey: Uint8Array;
        counter: number;
        transports?: string[];
        deviceName?: string;
    }) {
        return this.prisma.webauthnCredential.create({
            data: {
                userId: params.userId,
                credentialId: params.credentialId,
                publicKey: Buffer.from(params.publicKey),
                counter: params.counter,
                transports: params.transports ?? [],
                deviceName: params.deviceName,
            },
        });
    }

    updateCounter(id: string, counter: number) {
        return this.prisma.webauthnCredential.update({
            where: { id },
            data: { counter, lastUsedAt: new Date() },
        });
    }

    async remove(userId: string, id: string): Promise<void> {
        await this.prisma.webauthnCredential.deleteMany({ where: { id, userId } });
    }
}
