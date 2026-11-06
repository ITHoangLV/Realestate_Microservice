import Ajv2020, { ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DomainEvent } from '../../src/messaging/domain-event';

/**
 * Kiểm tra event (envelope + payload) khớp schema trong contracts/events/ ở gốc repo.
 * Dùng trong test của service, KHÔNG dùng lúc chạy thật (image Docker không có thư mục contracts):
 *
 *   const event = await outbox.add(manager, 'rental.requested', payload);
 *   expectEventMatchesContract(event);
 */
const CONTRACTS_DIR = resolve(__dirname, '..', '..', '..', '..', 'contracts', 'events');

let ajv: Ajv2020 | undefined;
const cache = new Map<string, ValidateFunction>();

function validatorFor(eventType: string, version: number): ValidateFunction {
  const file = `${eventType}.v${version}.schema.json`;
  const cached = cache.get(file);
  if (cached) return cached;
  const path = join(CONTRACTS_DIR, file);
  if (!existsSync(path)) {
    throw new Error(
      `Chưa có contract cho ${eventType} v${version} (thiếu contracts/events/${file})`,
    );
  }
  if (!ajv) {
    ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
    ajv.addKeyword('x-producer');
    addFormats(ajv);
    ajv.addSchema(JSON.parse(readFileSync(join(CONTRACTS_DIR, 'envelope.v1.schema.json'), 'utf8')));
  }
  const validate = ajv.compile(JSON.parse(readFileSync(path, 'utf8')));
  cache.set(file, validate);
  return validate;
}

export function expectEventMatchesContract(event: DomainEvent<object>): void {
  const label = `${event.eventType} v${event.version}`;
  const validate = validatorFor(event.eventType, event.version);
  if (!validate(event)) {
    throw new Error(`Event ${label} không khớp contract: ${ajv?.errorsText(validate.errors)}`);
  }
}
