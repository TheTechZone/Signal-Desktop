// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/better-sqlite3';

import type { LoggerType } from '../../types/Logging';

export default function updateToSchemaVersion82(
  currentVersion: number,
  db: Database,
  logger: LoggerType
): void {
  if (currentVersion >= 82) {
    return;
  }

  db.transaction(() => {
    db.exec(
      `
      CREATE TABLE trusted_introductions(
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        introducer_service_id TEXT,
        introducee_service_id TEXT NOT NULL,
        introducee_identity_key TEXT NOT NULL,
        introducee_name TEXT NOT NULL,
        introducee_number TEXT NOT NULL,
        predicted_fingerprint TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        state INTEGER NOT NULL
      );
      `
    );

    db.pragma('user_version = 82');
  })();

  logger.info('updateToSchemaVersion82: success!');
}
