import "dotenv/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module.js";
import { configureApp } from "@/config/configure-app.js";

/**
 * Boots the real application graph, so it needs the same PostgreSQL and Redis a
 * local `pnpm start:dev` needs. Run `pnpm db:migrate` first.
 */
describe("Application (e2e)", () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = configureApp(moduleFixture.createNestApplication<NestExpressApplication>());
        await app.init();
    });

    afterAll(async () => {
        await app?.close();
    });

    it("serves the liveness probe under the versioned prefix", async () => {
        const response = await request(app.getHttpServer()).get("/api/v1/health/live").expect(200);

        // The global interceptor wraps every non-`data` payload, so the probe
        // body arrives nested rather than at the top level.
        expect(response.body).toMatchObject({ data: { status: "ok" } });
    });

    it("404s the unprefixed root — every route lives under /api/v1", async () => {
        await request(app.getHttpServer()).get("/").expect(404);
    });

    it("rejects an unauthenticated call to a guarded route", async () => {
        const response = await request(app.getHttpServer()).get("/api/v1/users/me").expect(401);

        expect(response.body).toMatchObject({ statusCode: 401 });
    });

    it("returns the structured validation error shape on a bad payload", async () => {
        const response = await request(app.getHttpServer())
            .post("/api/v1/auth/signin")
            .send({ email: "not-an-email" })
            .expect(400);

        expect(response.body).toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
        expect(Array.isArray(response.body.details)).toBe(true);
    });
});
