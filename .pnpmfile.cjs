// @prisma/client объявляет prisma и typescript опциональными peer-зависимостями.
// pnpm подставляет туда dev-версии, и `pnpm deploy --prod` тащит в прод-образ весь prisma CLI (+500 МБ).
// Рантайму клиента (generator prisma-client + driver adapter) они не нужны.
const DROPPED_PEERS = ['prisma', 'typescript'];

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === '@prisma/client') {
        for (const name of DROPPED_PEERS) {
          // pnpm считает peer'ом и запись, которая осталась только в peerDependenciesMeta
          delete pkg.peerDependencies?.[name];
          delete pkg.peerDependenciesMeta?.[name];
        }
      }
      return pkg;
    },
  },
};
