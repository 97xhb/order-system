import { ConflictException } from '@nestjs/common';
import { SubmitterStatus } from '@prisma/client';

interface SubmitterNicknameMatch {
  code: string | null;
  status: SubmitterStatus;
  _count: { externalIdentities: number };
}

export function throwSubmitterNicknameConflict(nickname: string): never {
  throw new ConflictException(
    `微信昵称“${nickname}”已绑定其他下单人，请使用原识别码恢复身份或联系管理员`,
  );
}

export function assertNicknameCanBeClaimed(
  matches: SubmitterNicknameMatch[],
  nickname: string,
) {
  if (matches.length === 0) return;

  const candidate = matches[0];
  if (
    matches.length > 1 ||
    candidate.status !== SubmitterStatus.ACTIVE ||
    candidate.code !== null ||
    candidate._count.externalIdentities > 0
  ) {
    throwSubmitterNicknameConflict(nickname);
  }
}
