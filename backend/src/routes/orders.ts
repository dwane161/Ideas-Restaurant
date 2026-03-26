import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';

type BillingMode = 'single' | 'shared';

function accountKeyForIndex(index: number): string {
  const base = 65; // 'A'
  return index < 26 ? String.fromCharCode(base + index) : `A${index + 1}`;
}

function isCompletedItemStatus(status: unknown): boolean {
  return String(status ?? '')
    .trim()
    .toLowerCase() === 'completed';
}

function orderHasItems(items: Array<{ qty: number }> | undefined | null): boolean {
  return (items ?? []).some((i) => (i?.qty ?? 0) > 0);
}

function orderAllItemsCompleted(items: Array<{ qty: number; itemStatus: string | null }> | undefined | null): boolean {
  const present = (items ?? []).filter((i) => (i?.qty ?? 0) > 0);
  return present.length > 0 && present.every((i) => isCompletedItemStatus(i.itemStatus));
}

const openOrderSchema = z.object({
  tableId: z.number().int().positive(),
  billingMode: z.enum(['single', 'shared']),
  accountNames: z.array(z.string()).optional(),
  createdByUserId: z.string().min(1).optional()
});

const addItemSchema = z.object({
  accountKey: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  qtyDelta: z.number().int()
});

const paySchema = z.object({
  method: z.enum(['percentage', 'amounts']),
  splits: z
    .array(
      z.object({
        accountKey: z.string().min(1),
        amount: z.number().nonnegative(),
        percent: z.number().nonnegative().optional()
      })
    )
    .min(1)
});

export function registerOrdersRoutes(router: Router) {
  router.get('/orders', async (req, res, next) => {
    try {
      const statusRaw = z.string().min(1).optional().parse(req.query.status);
      const statuses = statusRaw
        ? statusRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : ['open', 'paid', 'cleaning'];

      const orders = await prisma.appOrder.findMany({
        where: {
          status: { in: statuses }
        },
        orderBy: { createdAt: 'desc' },
        include: { accounts: true, items: true }
      });

      const normalized = orders.map((order) => {
        const sortedAccounts = order.accounts
          .slice()
          .sort((a, b) => a.key.localeCompare(b.key));

        const accounts = sortedAccounts.map((a) => ({
          key: a.key,
          name: a.name,
          items: [] as Array<{
            id: string;
            name: string;
            qty: number;
            unitPrice: number;
            status: string;
          }>
        }));

        const accountIndex = new Map<string, number>();
        for (let i = 0; i < sortedAccounts.length; i++) {
          accountIndex.set(sortedAccounts[i].id, i);
        }

        for (const item of order.items) {
          const idx = accountIndex.get(item.accountId);
          if (idx === undefined) continue;
          const unitPrice = Number(item.unitPrice);
          accounts[idx].items.push({
            id: item.productId,
            name: item.productName,
            qty: item.qty,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            status: item.itemStatus
          });
        }

        return {
          id: order.id,
          tableId: order.tableId,
          status: order.status,
          billingMode: order.billingMode,
          accounts
        };
      });

      res.json({ orders: normalized });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/orders/:orderId/status', async (req, res, next) => {
    try {
      const orderId = z.string().uuid().parse(req.params.orderId);
      const payload = z
        .object({
          status: z.enum(['open', 'paid', 'cleaning', 'closed'])
        })
        .parse(req.body);

      if (payload.status === 'paid') {
        const current = await prisma.appOrder.findUnique({
          where: { id: orderId },
          include: { items: true }
        });
        if (!current) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        if (!orderHasItems(current.items) || !orderAllItemsCompleted(current.items)) {
          res.status(409).json({
            error: 'Order not ready to pay',
            code: 'ORDER_NOT_READY'
          });
          return;
        }
      }

      const order = await prisma.appOrder.update({
        where: { id: orderId },
        data: { status: payload.status }
      });

      res.json({ order: { id: order.id, status: order.status } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/orders/open', async (req, res, next) => {
    try {
      const payload = openOrderSchema.parse(req.body);

      const billingMode: BillingMode = payload.billingMode;
      const requestedNames =
        billingMode === 'shared'
          ? (payload.accountNames ?? []).map((n) => (typeof n === 'string' ? n.trim() : ''))
          : [];

      const count =
        billingMode === 'shared' ? Math.max(2, requestedNames.length || 2) : 1;

      const accounts = Array.from({ length: count }, (_, index) => ({
        key: accountKeyForIndex(index),
        name:
          billingMode === 'shared'
            ? requestedNames[index] || `Cuenta ${index + 1}`
            : 'Cuenta única'
      }));

      const order = await prisma.appOrder.create({
        data: {
          tableId: payload.tableId,
          billingMode: payload.billingMode,
          status: 'open',
          createdByUserId: payload.createdByUserId ?? null,
          accounts: {
            create: accounts.map((a) => ({ key: a.key, name: a.name }))
          }
        },
        include: { accounts: true }
      });

      res.status(201).json({
        order: {
          id: order.id,
          tableId: order.tableId,
          status: order.status,
          billingMode: order.billingMode,
          createdByUserId: order.createdByUserId,
          accounts: order.accounts.map((a) => ({ key: a.key, name: a.name }))
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders/by-table/:tableId', async (req, res, next) => {
    try {
      const tableId = z.coerce.number().int().positive().parse(req.params.tableId);
      const statusRaw = z.string().min(1).optional().parse(req.query.status);
      const statuses = statusRaw
        ? statusRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : ['open', 'paid', 'cleaning'];

      const order = await prisma.appOrder.findFirst({
        where: {
          tableId,
          status: { in: statuses }
        },
        orderBy: { createdAt: 'desc' },
        include: { accounts: true, items: true }
      });

      if (!order) {
        res.json({ order: null });
        return;
      }

      const sortedAccounts = order.accounts
        .slice()
        .sort((a, b) => a.key.localeCompare(b.key));

      const accounts = sortedAccounts.map((a) => ({
        key: a.key,
        name: a.name,
        items: [] as Array<{
          id: string;
          name: string;
          qty: number;
          unitPrice: number;
          status: string;
        }>
      }));

      const accountIndex = new Map<string, number>();
      for (let i = 0; i < sortedAccounts.length; i++) {
        accountIndex.set(sortedAccounts[i].id, i);
      }

      for (const item of order.items) {
        const idx = accountIndex.get(item.accountId);
        if (idx === undefined) continue;
        const unitPrice = Number(item.unitPrice);
        accounts[idx].items.push({
          id: item.productId,
          name: item.productName,
          qty: item.qty,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          status: item.itemStatus
        });
      }

      res.json({
        order: {
          id: order.id,
          tableId: order.tableId,
          status: order.status,
          billingMode: order.billingMode,
          accounts
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/orders/:orderId/items', async (req, res, next) => {
    try {
      const orderId = z.string().uuid().parse(req.params.orderId);
      const payload = addItemSchema.parse(req.body);

      const order = await prisma.appOrder.findUnique({
        where: { id: orderId },
        include: { accounts: true }
      });
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const account = order.accounts.find((a) => a.key === payload.accountKey);
      if (!account) {
        res.status(400).json({ error: `Unknown accountKey: ${payload.accountKey}` });
        return;
      }

      const existing = await prisma.appOrderItem.findUnique({
        where: {
          orderId_accountId_productId: {
            orderId,
            accountId: account.id,
            productId: payload.productId
          }
        }
      });

      const nextQty = (existing?.qty ?? 0) + payload.qtyDelta;
      if (nextQty <= 0) {
        if (existing) {
          await prisma.appOrderItem.delete({ where: { id: existing.id } });
        }
        res.json({ deleted: true });
        return;
      }

      const item = await prisma.appOrderItem.upsert({
        where: {
          orderId_accountId_productId: {
            orderId,
            accountId: account.id,
            productId: payload.productId
          }
        },
        create: {
          orderId,
          accountId: account.id,
          productId: payload.productId,
          productName: payload.productName,
          unitPrice: payload.unitPrice,
          qty: nextQty,
          itemStatus: 'pending'
        },
        update: {
          productName: payload.productName,
          unitPrice: payload.unitPrice,
          qty: nextQty
        }
      });

      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/orders/:orderId/pay', async (req, res, next) => {
    try {
      const orderId = z.string().uuid().parse(req.params.orderId);
      const payload = paySchema.parse(req.body);

      const order = await prisma.appOrder.findUnique({
        where: { id: orderId },
        include: { accounts: true, items: true }
      });
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      if (!orderHasItems(order.items) || !orderAllItemsCompleted(order.items)) {
        res.status(409).json({
          error: 'Order not ready to pay',
          code: 'ORDER_NOT_READY'
        });
        return;
      }

      const total = payload.splits.reduce((sum, s) => sum + s.amount, 0);

      const invoice = await prisma.appInvoice.create({
        data: {
          orderId,
          method: payload.method,
          total,
          splits: {
            create: payload.splits.map((s) => {
              const account = order.accounts.find((a) => a.key === s.accountKey);
              if (!account) {
                throw new Error(`Unknown accountKey: ${s.accountKey}`);
              }
              return {
                accountId: account.id,
                amount: s.amount,
                percent: s.percent ?? null
              };
            })
          }
        },
        include: { splits: true }
      });

      await prisma.appOrder.update({
        where: { id: orderId },
        data: { status: 'paid' }
      });

      res.status(201).json({ invoice });
    } catch (err) {
      next(err);
    }
  });
}
