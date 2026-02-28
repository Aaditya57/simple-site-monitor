import * as schema from "./schema.js";
export * from "./schema.js";
export declare function getDb(): import("drizzle-orm/node-postgres").NodePgDatabase<Record<string, unknown>> & {
    $client: import("drizzle-orm/node-postgres").NodePgClient;
};
export { schema };
//# sourceMappingURL=index.d.ts.map