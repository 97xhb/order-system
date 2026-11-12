import { ConfigService } from '@nestjs/config';
import { ShareFormStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SHARE_FORM_FIELD_CONFIG } from '../schemes/share-form-config';
import { PublicFormsService } from './public-forms.service';

const identity = {
  id: 'identity-1',
  displayCode: 'WX-TEST',
  submitterId: 'submitter-1',
};

const createService = (
  schemeEnabled: boolean,
  shareStatus: ShareFormStatus = ShareFormStatus.ACTIVE,
) => {
  const prisma = {
    shareForm: {
      findUnique: jest.fn(async () => ({
        id: 'form-1',
        title: '测试方案',
        description: null,
        fieldConfig: DEFAULT_SHARE_FORM_FIELD_CONFIG,
        allowEditBeforeApproval: true,
        allowDeleteBeforeApproval: true,
        status: shareStatus,
        startsAt: null,
        expiresAt: null,
        submissionLimit: null,
        scheme: {
          id: 'scheme-1',
          name: '测试方案',
          productName: '测试内容',
          productNameHtml: null,
          description: null,
          defaultValues: null,
          enabled: schemeEnabled,
          category: null,
        },
      })),
    },
    platform: {
      findMany: jest.fn(async () => []),
    },
    category: {
      findMany: jest.fn(async () => []),
    },
    externalIdentity: {
      findUnique: jest.fn(async () => ({
        id: identity.id,
        code: 'WX-TEST',
        name: '测试下单人',
        nickname: '测试下单人',
        payoutMethods: [],
      })),
    },
  };
  return new PublicFormsService(
    prisma as unknown as PrismaService,
    {} as ConfigService,
  );
};

describe('PublicFormsService scheme status', () => {
  it('opens an active share link when the scheme is disabled', async () => {
    const service = createService(false);

    const result = await service.describe('token-1', identity);

    expect(result.form.canSubmit).toBe(false);
    expect(result.form.scheme.name).toBe('测试方案');
  });

  it('blocks new orders when the scheme is disabled', async () => {
    const service = createService(false);

    await expect(
      service.createOrder('token-1', identity, {} as never, {}),
    ).rejects.toThrow('该方案当前已停用，暂不能提交新报单');
  });

  it('blocks opening the link when the share status is not active', async () => {
    const service = createService(true, ShareFormStatus.PAUSED);

    await expect(service.describe('token-1', identity)).rejects.toThrow(
      '该登记链接当前未开放',
    );
  });
});
