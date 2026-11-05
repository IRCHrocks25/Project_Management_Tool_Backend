import { UserRole } from '../users/entities/user.entity';
import {
  Access,
  NO_ACCESS,
  canManageVaultItem,
  canSeeVaultItem,
  matchesAccess,
  namedShareUserIds,
  pageAccessLevel,
  sameAccess,
} from './workspace-access';

const access = (over: Partial<Access> = {}): Access => ({ ...NO_ACCESS, ...over });
const item = (scope: string, a: Access = NO_ACCESS) => ({ scope, ownerId: 'owner', access: a });
const designer = { userId: 'u1', role: UserRole.DESIGNER };
const ceo = { userId: 'ceo', role: UserRole.FOUNDER_CEO };
const pm = { userId: 'pm', role: UserRole.PROJECT_MANAGER };
const owner = { userId: 'owner', role: UserRole.DEVELOPER };

describe('personal vault items', () => {
  it('belong to the owner alone', () => {
    expect(canSeeVaultItem(owner, item('personal'))).toBe(true);
    expect(canManageVaultItem(owner, item('personal'))).toBe(true);
  });

  it('give FOUNDER/CEO and Project Manager no override', () => {
    for (const admin of [ceo, pm]) {
      expect(canSeeVaultItem(admin, item('personal'))).toBe(false);
      expect(canManageVaultItem(admin, item('personal'))).toBe(false);
    }
  });

  it('ignore any access stored on the row', () => {
    const open = item('personal', access({ everyone: true, departments: [UserRole.DESIGNER], userIds: ['u1'] }));
    expect(canSeeVaultItem(designer, open)).toBe(false);
  });

  it('are unreachable once the owner is gone', () => {
    expect(canSeeVaultItem(owner, { scope: 'personal', ownerId: null, access: NO_ACCESS })).toBe(false);
  });
});

describe('company vault items', () => {
  it('let FOUNDER/CEO and Project Manager see and manage', () => {
    for (const admin of [ceo, pm]) {
      expect(canSeeVaultItem(admin, item('company'))).toBe(true);
      expect(canManageVaultItem(admin, item('company'))).toBe(true);
    }
  });

  it('let the owner see and manage with nobody in access', () => {
    expect(canSeeVaultItem(owner, item('company'))).toBe(true);
    expect(canManageVaultItem(owner, item('company'))).toBe(true);
  });

  it('match by department', () => {
    const it_ = item('company', access({ departments: [UserRole.DESIGNER] }));
    expect(canSeeVaultItem(designer, it_)).toBe(true);
    expect(canSeeVaultItem({ userId: 'u2', role: UserRole.CRM }, it_)).toBe(false);
  });

  it('match by named user', () => {
    const it_ = item('company', access({ userIds: ['u1'] }));
    expect(canSeeVaultItem(designer, it_)).toBe(true);
    expect(canSeeVaultItem({ userId: 'u2', role: UserRole.DESIGNER }, it_)).toBe(false);
  });

  it('match everyone', () => {
    expect(canSeeVaultItem(designer, item('company', access({ everyone: true })))).toBe(true);
  });

  it('do not let people who merely have access manage', () => {
    expect(canManageVaultItem(designer, item('company', access({ everyone: true, userIds: ['u1'] })))).toBe(false);
  });

  it('deny when there is no user', () => {
    const open = item('company', access({ everyone: true }));
    expect(canSeeVaultItem({ userId: '', role: UserRole.FOUNDER_CEO }, open)).toBe(false);
    expect(matchesAccess({ userId: '' }, open.access)).toBe(false);
  });
});

it('never opens product rows through the company vault rules', () => {
  const row = { scope: 'product', ownerId: 'owner', access: access({ everyone: true }) };
  expect(canSeeVaultItem(ceo, row)).toBe(false);
  expect(canSeeVaultItem(owner, row)).toBe(false);
  expect(canManageVaultItem(owner, row)).toBe(false);
});

describe('sameAccess', () => {
  it('ignores order and duplicates', () => {
    expect(sameAccess(access({ userIds: ['a', 'b'] }), access({ userIds: ['b', 'a', 'a'] }))).toBe(true);
  });

  it('notices a real change', () => {
    expect(sameAccess(access({ everyone: true }), access())).toBe(false);
    expect(sameAccess(access({ departments: ['CRM'] }), access({ departments: ['Designer'] }))).toBe(false);
  });
});

describe('pageAccessLevel', () => {
  const page = { ownerId: 'owner' };

  it('gives the owner everything, with no shares', () => {
    expect(pageAccessLevel(owner, page, [])).toBe('owner');
  });

  it('gives no admin override on pages', () => {
    expect(pageAccessLevel(ceo, page, [])).toBeNull();
    expect(pageAccessLevel(pm, page, [])).toBeNull();
  });

  it('matches department and named user shares', () => {
    expect(pageAccessLevel(designer, page, [{ kind: 'department', target: UserRole.DESIGNER, permission: 'view' }])).toBe('view');
    expect(pageAccessLevel(designer, page, [{ kind: 'department', target: UserRole.CRM, permission: 'edit' }])).toBeNull();
    expect(pageAccessLevel(designer, page, [{ kind: 'user', target: 'u1', permission: 'edit' }])).toBe('edit');
    expect(pageAccessLevel(designer, page, [{ kind: 'user', target: 'u2', permission: 'edit' }])).toBeNull();
  });

  it('lets the strongest matching share win, in any order', () => {
    const view = { kind: 'everyone', target: null, permission: 'view' };
    const edit = { kind: 'department', target: UserRole.DESIGNER, permission: 'edit' };
    expect(pageAccessLevel(designer, page, [view, edit])).toBe('edit');
    expect(pageAccessLevel(designer, page, [edit, view])).toBe('edit');
  });

  it('ignores a stronger share that does not match', () => {
    const shares = [
      { kind: 'everyone', target: null, permission: 'view' },
      { kind: 'user', target: 'someone-else', permission: 'edit' },
    ];
    expect(pageAccessLevel(designer, page, shares)).toBe('view');
  });

  it('applies shares to admins like anyone else', () => {
    expect(pageAccessLevel(ceo, page, [{ kind: 'everyone', target: null, permission: 'view' }])).toBe('view');
  });

  it('denies when there is no user, and does not treat a missing owner as a match', () => {
    expect(pageAccessLevel({ userId: '' }, { ownerId: null }, [{ kind: 'everyone', target: null, permission: 'edit' }])).toBeNull();
    expect(pageAccessLevel(designer, { ownerId: null }, [])).toBeNull();
  });
});

describe('namedShareUserIds', () => {
  const users = [
    { id: 'a', role: UserRole.DESIGNER },
    { id: 'b', role: UserRole.CRM },
    { id: 'c', role: null },
  ];

  it('expands departments and named users', () => {
    const ids = namedShareUserIds(
      [
        { kind: 'department', target: UserRole.DESIGNER, permission: 'view' },
        { kind: 'user', target: 'c', permission: 'edit' },
      ],
      users,
    );
    expect([...ids].sort()).toEqual(['a', 'c']);
  });

  it('never includes people reached only through everyone', () => {
    expect(namedShareUserIds([{ kind: 'everyone', target: null, permission: 'view' }], users).size).toBe(0);
  });
});
