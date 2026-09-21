Use Prisma version 7

use absolute path please

the folder architecture should be:
src/
├── config/
├── common/
├── database/
├── integrations/
├── modules/
├── app.module.ts
└── main.ts

do not add index.ts type files where all files export didnt need that.

use zod strictObject when create schema and then nestjs-zod use this to convert class dto and use in the controller and in the service use dto type which is create from the schema

Response convention: Paginated endpoints must return {data, meta:{page,limit,total}} from the service layer.
