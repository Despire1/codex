declare module '@prisma/client' {
  export class PrismaClient {
    constructor(options?: any);
    $disconnect(): Promise<void>;
  }
}
