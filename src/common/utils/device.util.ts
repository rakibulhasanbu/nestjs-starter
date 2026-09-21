import { UAParser } from "ua-parser-js";

export interface DeviceInfo {
    deviceType: string | null;
    deviceName: string | null;
}

/**
 * Explicit client-supplied device info wins (reliable for native apps);
 * falls back to parsing the User-Agent header (works automatically for web).
 */
export function resolveDeviceInfo(
    userAgent: string | undefined,
    explicit?: { deviceType?: string; deviceName?: string },
): DeviceInfo {
    if (explicit?.deviceType || explicit?.deviceName) {
        return {
            deviceType: explicit.deviceType ?? null,
            deviceName: explicit.deviceName ?? null,
        };
    }

    if (!userAgent) {
        return { deviceType: null, deviceName: null };
    }

    const parsed = new UAParser(userAgent).getResult();
    const deviceType = parsed.device.type ?? "desktop";
    const deviceName = [parsed.os.name, parsed.browser.name].filter(Boolean).join(" · ") || null;

    return { deviceType, deviceName };
}
