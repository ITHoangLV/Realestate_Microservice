import { PageQueryDto } from '../../common/response/page-query.dto';

/** Query của `GET /listings/mine`: chỉ phân trang (`page`, `pageSize` 20/50). Sắp xếp cố định `created_at DESC, id DESC`. */
export class ListMineQuery extends PageQueryDto {}
