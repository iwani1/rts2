export function assertFreshTestSchema(relationNames) {
  if (relationNames.length > 0) {
    throw new Error('Refusing test migration: the disposable test database is not empty. Create a fresh local *_test database before applying raw test migrations.');
  }
}
