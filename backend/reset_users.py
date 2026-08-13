#!/usr/bin/env python3
"""Clear stored accounts and/or session tokens from the backend user store."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone

USERS_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'users.json')


def load_db() -> dict:
    if not os.path.exists(USERS_DB_PATH):
        return {'users': [], 'sessions': []}

    try:
        with open(USERS_DB_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as error:
        print(f'Could not read {USERS_DB_PATH}: {error}', file=sys.stderr)
        raise SystemExit(1)

    if not isinstance(data, dict):
        return {'users': [], 'sessions': []}

    users = data.get('users', [])
    sessions = data.get('sessions', [])
    return {
        'users': users if isinstance(users, list) else [],
        'sessions': sessions if isinstance(sessions, list) else [],
    }


def save_db(data: dict) -> None:
    # Write to a temp file first so an interrupted run cannot truncate the store.
    tmp_path = f'{USERS_DB_PATH}.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    os.replace(tmp_path, USERS_DB_PATH)


def back_up() -> str | None:
    if not os.path.exists(USERS_DB_PATH):
        return None

    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup_path = f'{USERS_DB_PATH}.{stamp}.bak'
    shutil.copy2(USERS_DB_PATH, backup_path)
    return backup_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--sessions-only',
        action='store_true',
        help='Revoke all session tokens but keep registered accounts.',
    )
    parser.add_argument('-y', '--yes', action='store_true', help='Skip the confirmation prompt.')
    parser.add_argument('--no-backup', action='store_true', help='Do not write a timestamped backup file.')
    args = parser.parse_args()

    db = load_db()
    user_count = len(db['users'])
    session_count = len(db['sessions'])

    if args.sessions_only:
        action = f'revoke {session_count} session token(s) and keep {user_count} account(s)'
    else:
        action = f'delete {user_count} account(s) and {session_count} session token(s)'

    if user_count == 0 and session_count == 0:
        print('Nothing to clear: the user store is already empty.')
        return 0

    print(f'Store: {USERS_DB_PATH}')
    if not args.yes:
        answer = input(f'This will {action}. Continue? [y/N] ').strip().lower()
        if answer not in {'y', 'yes'}:
            print('Aborted.')
            return 1

    backup_path = None if args.no_backup else back_up()

    db['sessions'] = []
    if not args.sessions_only:
        db['users'] = []

    save_db(db)

    if backup_path:
        print(f'Backup written to {backup_path}')
    print(f'Done: {len(db["users"])} account(s), {len(db["sessions"])} session token(s) remaining.')
    print('Signed-in clients must log in again.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
