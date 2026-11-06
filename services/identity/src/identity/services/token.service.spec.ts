import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPrivateKey, TokenService } from './token.service';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function makeService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    JWT_PRIVATE_KEY: privateKey,
    JWT_ISSUER: 'realestate-identity',
    JWT_ACCESS_TTL_SECONDS: 900,
    ...overrides,
  };
  const config = { get: (k: string) => values[k] } as unknown as ConfigService<never, true>;
  const jwt = new JwtService();
  return { service: new TokenService(config, jwt), jwt };
}

describe('TokenService', () => {
  it('access token ký RS256, kiểm tra được bằng khóa CÔNG KHAI, có đủ claims', async () => {
    const { service, jwt } = makeService();
    const { accessToken, expiresIn } = await service.signAccessToken({
      id: '11111111-1111-4111-8111-111111111111',
      role: 'LANDLORD',
    });
    expect(expiresIn).toBe(900);

    const payload = await jwt.verifyAsync(accessToken, {
      publicKey,
      algorithms: ['RS256'],
      issuer: 'realestate-identity',
    });
    expect(payload).toMatchObject({
      sub: '11111111-1111-4111-8111-111111111111',
      roles: ['LANDLORD'],
      iss: 'realestate-identity',
    });
    expect(payload.exp - payload.iat).toBe(900);
    expect(typeof payload.jti).toBe('string');
    // header phải là RS256 (không phải HS256 hay none)
    const header = JSON.parse(Buffer.from(accessToken.split('.')[0], 'base64url').toString());
    expect(header.alg).toBe('RS256');
  });

  it('mỗi access token có jti khác nhau', async () => {
    const { service, jwt } = makeService();
    const user = { id: '11111111-1111-4111-8111-111111111111', role: 'TENANT' as const };
    const a = jwt.decode((await service.signAccessToken(user)).accessToken);
    const b = jwt.decode((await service.signAccessToken(user)).accessToken);
    expect(a.jti).not.toBe(b.jti);
  });

  it('token ký bằng khóa khác bị từ chối khi kiểm tra bằng khóa công khai của hệ thống', async () => {
    const other = makeService({
      JWT_PRIVATE_KEY: generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      }).privateKey,
    });
    const { accessToken } = await other.service.signAccessToken({ id: 'x', role: 'TENANT' });
    await expect(
      other.jwt.verifyAsync(accessToken, { publicKey, algorithms: ['RS256'] }),
    ).rejects.toThrow(/invalid signature/);
  });

  it('refresh token: 32 byte ngẫu nhiên dạng base64url, không trùng nhau', () => {
    const { service } = makeService();
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('loadPrivateKey: nhận PEM có \\n, đọc từ file, và báo rõ khi thiếu/sai đường dẫn', () => {
    expect(loadPrivateKey({ JWT_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n') })).toBe(privateKey);

    const dir = mkdtempSync(join(tmpdir(), 'jwtkey-'));
    try {
      const path = join(dir, 'private.pem');
      writeFileSync(path, privateKey);
      expect(loadPrivateKey({ JWT_PRIVATE_KEY_PATH: path })).toBe(privateKey);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(() => loadPrivateKey({ JWT_PRIVATE_KEY_PATH: '/khong/co/file.pem' })).toThrow(
      /Không đọc được JWT_PRIVATE_KEY_PATH/,
    );
    expect(() => loadPrivateKey({})).toThrow(/Thiếu JWT_PRIVATE_KEY/);
  });

  it('khóa công khai sinh ra từ cặp test là khóa RSA hợp lệ', () => {
    expect(createPublicKey(publicKey).asymmetricKeyType).toBe('rsa');
  });
});
