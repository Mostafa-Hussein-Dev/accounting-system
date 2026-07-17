// NOTE(FR-401/FR-404): Branch.stockLocationId is nullable with no FK until the
// inventory `Location` model ships — flip it to NOT-NULL + add the FK then.
export * from './branches.module';
export * from './branches.service';
