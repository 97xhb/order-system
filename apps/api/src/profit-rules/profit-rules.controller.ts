import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import { CreateProfitRuleVersionDto } from './dto/create-profit-rule-version.dto';
import { ProfitRulesService } from './profit-rules.service';

@ApiTags('profit rules')
@ApiCookieAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/profit-rules')
export class ProfitRulesController {
  constructor(private readonly profitRulesService: ProfitRulesService) {}

  @Get()
  @ApiOperation({ summary: '查询利润规则版本及可选范围' })
  list() {
    return this.profitRulesService.list();
  }

  @Post()
  @ApiOperation({ summary: '保存新的利润规则版本' })
  createVersion(
    @Body() dto: CreateProfitRuleVersionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.profitRulesService.createVersion(dto, admin);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: '重新启用指定历史版本' })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.profitRulesService.activate(id, admin);
  }
}
