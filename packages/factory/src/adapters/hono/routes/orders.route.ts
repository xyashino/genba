import { Hono } from 'hono';
import { honoAdapter } from '../adapter.ts';
import type { AppEnv } from '../types.ts';
import { importOrdersProcedure } from '../../../application/procedures/orders/import-orders.procedure.ts';
import { listOrdersProcedure } from '../../../application/procedures/orders/list-orders.procedure.ts';
import { getOrderProcedure } from '../../../application/procedures/orders/get-order.procedure.ts';
import { cancelOrderProcedure } from '../../../application/procedures/orders/cancel-order.procedure.ts';

export const ordersRoute = new Hono<AppEnv>()
  .post('/import', honoAdapter(importOrdersProcedure))
  .get('/', honoAdapter(listOrdersProcedure))
  .get('/:id', honoAdapter(getOrderProcedure))
  .post('/:id/cancel', honoAdapter(cancelOrderProcedure));
