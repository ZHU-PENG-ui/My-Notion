import { AuthConfig } from "convex/server";

export default {
    providers: [
        {
            // 自动读取你本地.env.local的Clerk域名，永远和你的项目匹配
            domain: process.env.NEXT_PUBLIC_CLERK_DOMAIN!,
            applicationID: "convex",
        },
    ],
} satisfies AuthConfig;