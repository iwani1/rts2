import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { buildRentalPricingPreview, UnknownPricingModelError } from '@/modules/rentals/pricing-preview';
import { resolveRequestedDuration } from '@/modules/rentals/pricing-quantities';
import { getCompanyRentalPricingModels, SettingNotConfiguredError } from '@/modules/settings/registry';
import { getPrisma } from '@/server/prisma';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; requestId: string }> };
const requestIds = z.object({ companyId: z.string().trim().min(1).max(128), requestId: z.string().trim().min(1).max(128) });
const previewInput = z.object({
  modelCodes: z.array(z.string().trim().regex(/^[A-Z0-9_-]{2,32}$/)).min(1).max(50),
  distanceMetres: z.number().int().positive().safe().optional(),
}).strict().refine((input) => new Set(input.modelCodes).size === input.modelCodes.length, {
  message: 'Choose each pricing model only once.', path: ['modelCodes'],
});

type LoadedPricingContext = {
  companyId: string;
  rentalRequest: {
    id: string;
    status: string;
    serviceDate: Date | null;
    departureTime: string | null;
    returnDate: Date | null;
    returnTime: string | null;
    durationMinutes: number | null;
  };
};
type LoadContextResult = { response: NextResponse } | { context: LoadedPricingContext };

async function loadContext(request: Request, context: RouteContext): Promise<LoadContextResult> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  const { companyId, requestId } = requestIds.parse(await context.params);
  const permission = await resolvePermission({ userId: session.user.id, companyId, permission: 'rental:manage' });
  if (!permission.allowed) return { response: NextResponse.json({ error: 'Access denied.' }, { status: 403 }) };
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') return { response: NextResponse.json({ error: 'Company not found.' }, { status: 404 }) };
  const rentalRequest = await prisma.rentalRequest.findFirst({
    where: { id: requestId, companyId },
    select: { id: true, status: true, serviceDate: true, departureTime: true, returnDate: true, returnTime: true, durationMinutes: true },
  });
  if (!rentalRequest) return { response: NextResponse.json({ error: 'Rental request not found.' }, { status: 404 }) };
  if (rentalRequest.status !== 'Under Review') return { response: NextResponse.json({ error: 'Internal pricing preview is available only while a request is Under Review.' }, { status: 409 }) };
  return { context: { companyId, rentalRequest } };
}

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the selected pricing models and quantities.' }, { status: 400 });
  if (error instanceof SettingNotConfiguredError) return NextResponse.json({ error: 'Rental pricing models are not configured.' }, { status: 409 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof RangeError) return NextResponse.json({ error: 'The calculated amount is outside the supported range.' }, { status: 400 });
  if (error instanceof Error && ['PricingQuantityMissingError', 'InvalidPricingQuantityError', 'InvalidPricingPreviewError', 'UnknownPricingModelError'].includes(error.name)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const loaded = await loadContext(request, context);
    if ('response' in loaded) return loaded.response;
    const models = await getCompanyRentalPricingModels(loaded.context.companyId);
    return NextResponse.json({ models }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const loaded = await loadContext(request, context);
    if ('response' in loaded) return loaded.response;
    const input = previewInput.parse(await request.json());
    const models = await getCompanyRentalPricingModels(loaded.context.companyId);
    if (!models) return NextResponse.json({ error: 'Rental pricing models are not configured.' }, { status: 409 });
    const selectedModels = input.modelCodes.map((code) => {
      const model = models.find((candidate) => candidate.code === code);
      if (!model) throw new UnknownPricingModelError(code);
      return model;
    });
    const needsDuration = selectedModels.some((model) => model.unit === 'PER_HOUR' || model.unit === 'PER_DAY');
    const duration = needsDuration ? resolveRequestedDuration(loaded.context.rentalRequest) : null;
    if (duration && !duration.ready) return NextResponse.json({ error: `Time-priced line blocked: ${duration.reason.toLowerCase().replaceAll('_', ' ')}.` }, { status: 409 });
    const lines = selectedModels.map((model) => ({
      lineId: model.code,
      modelCode: model.code,
      quantity: {
        ...(model.unit === 'PER_KM' ? { distanceMetres: input.distanceMetres } : {}),
        ...(model.unit === 'PER_HOUR' || model.unit === 'PER_DAY' ? { durationMinutes: duration?.ready ? duration.durationMinutes : undefined } : {}),
      },
    }));
    const preview = buildRentalPricingPreview(models, lines);
    return NextResponse.json({ preview, disclaimer: 'Internal pre-tax estimate only. Not a quotation; tax, discount, deposit, approval, validity, issue, and acceptance are not included.' }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
