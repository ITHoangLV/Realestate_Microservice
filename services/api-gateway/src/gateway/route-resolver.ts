import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvVars } from '../config/env.validation';
import { routeNotFound } from './errors/gateway.errors';
import { Access, ROUTES, RouteRule, SERVICE_ENV_URL, ServiceName } from './routes';

export interface ResolvedRoute {
  service: ServiceName;
  /** Địa chỉ gốc của service đích (INTERNAL_<SERVICE>_URL). */
  target: string;
  access: Access;
}

interface CompiledRule {
  rule: RouteRule;
  /** Các đoạn của đường dẫn, không gồm `/*` cuối; đoạn literal đã hạ chữ thường (so không phân biệt hoa thường). */
  segments: string[];
  /** true: khớp tiền tố và mọi đường dẫn dưới nó. */
  wildcard: boolean;
  methods?: ReadonlySet<string>;
}

function compile(rule: RouteRule): CompiledRule {
  const wildcard = rule.pattern.endsWith('/*');
  const base = wildcard ? rule.pattern.slice(0, -2) : rule.pattern;
  return {
    rule,
    segments: base
      .split('/')
      .slice(1)
      .map((s) => (s.startsWith(':') ? s : s.toLowerCase())),
    wildcard,
    methods: rule.methods ? new Set(rule.methods) : undefined,
  };
}

const COMPILED: readonly CompiledRule[] = ROUTES.map(compile);

/** Ký tự mã hóa dùng để giấu `.`, `/`, `\`: không bao giờ hợp lệ trong đường dẫn của gateway. */
const SMUGGLED = /%2e|%2f|%5c|\\/i;

/**
 * Tách đường dẫn thành các đoạn. Trả undefined nếu đường dẫn lạ (đoạn rỗng giữa đường dẫn, `.`, `..`,
 * `%2e`/`%2f`/`%5c`): không bao giờ khớp để không ai né được mức truy cập bằng cách viết lại đường dẫn.
 */
function toSegments(rawPath: string): string[] | undefined {
  const end = rawPath.search(/[?#]/);
  const path = end === -1 ? rawPath : rawPath.slice(0, end);
  if (!path.startsWith('/') || SMUGGLED.test(path)) return undefined;
  const segments = path.slice(1).split('/');
  if (segments[segments.length - 1] === '') segments.pop(); // bỏ một dấu / cuối
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return undefined;
  return segments;
}

function matches(c: CompiledRule, method: string, segments: string[]): boolean {
  if (c.methods && !c.methods.has(method)) return false;
  if (segments.length < c.segments.length) return false;
  if (!c.wildcard && segments.length !== c.segments.length) return false;
  // Literal so không phân biệt hoa thường như Express/service đích (`/listings/MINE` vẫn tới handler `mine`);
  // chỉ so, KHÔNG đổi đường dẫn chuyển tiếp. Đoạn `:tên` khớp mọi giá trị.
  return c.segments.every((want, i) => want.startsWith(':') || want === segments[i].toLowerCase());
}

/**
 * Khớp method + đường dẫn với bảng định tuyến (routes.ts) → { service, target, access }.
 * Không khớp → 404 GATEWAY_ROUTE_NOT_FOUND.
 */
@Injectable()
export class RouteResolver {
  constructor(private readonly config: ConfigService<EnvVars, true>) {}

  resolve(method: string, path: string): ResolvedRoute {
    const upper = method.toUpperCase();
    const effective = upper === 'HEAD' ? 'GET' : upper;
    const segments = toSegments(path);
    const hit = segments && COMPILED.find((c) => matches(c, effective, segments));
    if (!hit) throw routeNotFound();
    const { service, access } = hit.rule;
    return {
      service,
      target: this.config.getOrThrow(SERVICE_ENV_URL[service], { infer: true }),
      access,
    };
  }
}
