import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { normalizePhone } from '../lib/phone';
import { Availability, Business, DeliveryZone, Region, Service, User } from '../models';

/** Idempotent: safe to run more than once. Creates the region, an admin and sample shops. */
async function main() {
  await mongoose.connect(env.MONGODB_URI);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  const phone = normalizePhone(process.env.SEED_ADMIN_PHONE ?? '');
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!phone || password.length < 8) throw new Error('Set SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD (8+ chars) in .env');

  const regionName = process.env.SEED_REGION_NAME ?? 'Local area';
  const region = await Region.findOneAndUpdate(
    { slug: regionName.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
    { $setOnInsert: { name: regionName, towns: [], active: true } },
    { upsert: true, new: true },
  );

  let admin = await User.findOne({ phone });
  if (!admin) {
    admin = await User.create({
      name: 'Platform Admin',
      phone,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
      acceptedTermsVersion: '1.0',
      acceptedTermsAt: new Date(),
    });
  }

  await DeliveryZone.findOneAndUpdate(
    { regionId: region._id, name: 'Local delivery' },
    { $setOnInsert: { fee: 100, freeDeliveryOver: 1500, towns: [], active: true } },
    { upsert: true },
  );

  const hours = [1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '09:00', close: '17:00' }));
  const shop = async (slug: string, data: Record<string, unknown>) => {
    let biz = await Business.findOne({ slug });
    if (!biz) {
      biz = await Business.create({ ...data, slug, ownerId: admin!._id, regionId: region._id, status: 'active', phone: phone! , town: 'Town' });
      await Availability.create({ businessId: biz._id, weeklyHours: hours });
    }
    return biz;
  };

  const ink = await shop('ink-studio', {
    name: 'Ink Studio',
    category: 'body-art',
    description: 'Custom tattoos by appointment. Sterile equipment, single-use needles.',
  });
  if (!(await Service.exists({ businessId: ink._id }))) {
    await Service.create({
      businessId: ink._id, regionId: region._id, name: 'Tattoo session (small piece)', kind: 'service',
      price: 3000, priceType: 'from', durationMinutes: 120, depositType: 'fixed', depositValue: 500,
      locationOptions: ['at_shop'], leadTimeHours: 24,
    });
  }

  const farm = await shop('fresh-farm-goods', {
    name: 'Fresh Farm Goods',
    category: 'farm-goods',
    description: 'Eggs, farm produce and mushroom grow kits, delivered or ready for pickup.',
  });
  if (!(await Service.exists({ businessId: farm._id }))) {
    await Service.create([
      { businessId: farm._id, regionId: region._id, name: 'Eggs (tray of 30)', kind: 'goods', price: 450, unit: 'tray', stockQuantity: 40, fulfilmentOptions: ['delivery', 'pickup'] },
      { businessId: farm._id, regionId: region._id, name: 'Mushroom grow kit', kind: 'goods', price: 800, unit: 'kit', stockQuantity: 20, fulfilmentOptions: ['delivery', 'pickup'] },
    ]);
  }

  console.log(`Seeded. Sign in as admin with phone ${phone}. Change the password after first login.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
