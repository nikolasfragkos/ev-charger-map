import { Request, Response } from 'express';
import prisma from '../prisma/client.ts';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const PROFILE_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
    role: true,
    preferences: true,
    outstandingBalanceEur: true,
    createdAt: true,
    updatedAt: true,
} as const;

const ADDRESS_FIELDS = ["address", "city", "state", "zipCode"] as const;
type AddressKey = (typeof ADDRESS_FIELDS)[number];

const defaultAddressValues: Record<AddressKey, string> = {
    address: '',
    city: '',
    state: '',
    zipCode: '',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const extractProfileAddress = (preferences: unknown) => {
    if (!isPlainObject(preferences)) return { ...defaultAddressValues };
    const raw = preferences.profileAddress;
    if (!isPlainObject(raw)) return { ...defaultAddressValues };

    const parsed = { ...defaultAddressValues };
    for (const key of ADDRESS_FIELDS) {
        const value = raw[key];
        if (typeof value === 'string') parsed[key] = value;
    }
    return parsed;
};

const stripProfileAddressFromPreferences = (preferences: unknown) => {
    if (!isPlainObject(preferences)) return preferences ?? null;
    const { profileAddress, ...rest } = preferences;
    return Object.keys(rest).length ? rest : null;
};

const formatUserProfileResponse = <T extends { preferences: unknown }>(user: T) => {
    const address = extractProfileAddress(user.preferences);
    const preferences = stripProfileAddressFromPreferences(user.preferences);
    return { ...user, ...address, preferences };
};

const buildUpdatedPreferences = (
    currentPreferences: unknown,
    preferencesPayload: unknown,
    addressPayload: Partial<Record<AddressKey, string | undefined>>,
) => {
    const base = isPlainObject(currentPreferences) ? { ...currentPreferences } : {};
    let modified = false;

    if (isPlainObject(preferencesPayload)) {
        Object.assign(base, preferencesPayload);
        modified = true;
    }

    const addressUpdates: Partial<Record<AddressKey, string>> = {};
    for (const key of ADDRESS_FIELDS) {
        const nextValue = addressPayload[key];
        if (nextValue !== undefined) {
            addressUpdates[key] = nextValue;
        }
    }

    if (Object.keys(addressUpdates).length > 0) {
        const existingAddress = isPlainObject(base.profileAddress)
            ? { ...base.profileAddress }
            : {};
        for (const key of ADDRESS_FIELDS) {
            if (addressUpdates[key] !== undefined) {
                existingAddress[key] = addressUpdates[key] ?? '';
            }
        }
        base.profileAddress = existingAddress;
        modified = true;
    }

    return modified ? base : undefined;
};

// Validation Schemas
const profileUpdateSchema = z.object({
  email: z.email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
  preferences: z.any().optional(),
});

const changePasswordSchema = z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(8),
});

import { CarColor } from '@prisma/client';

const carOwnershipSchema = z.object({
  carId: z.number().int().positive(),
  color: z.enum(['RED', 'BLUE', 'YELLOW', 'WHITE', 'BLACK', 'SILVER', 'GREY', 'GREEN', 'ORANGE', 'PURPLE']),
});

const paymentMethodSchema = z.object({
    provider: z.string(),
    tokenLast4: z.string().length(4),
});

// Profile Controllers
export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: PROFILE_SELECT,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(formatUserProfileResponse(user));
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

    try {
        const existingUser = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { preferences: true },
        });
        if (!existingUser) return res.status(404).json({ error: "User not found" });

        const { address, city, state, zipCode, preferences, ...basicFields } = parsed.data;
        const preferencesUpdate = buildUpdatedPreferences(
            existingUser.preferences,
            preferences,
            { address, city, state, zipCode }
        );

        const updateData: Record<string, unknown> = { ...basicFields };
        if (preferencesUpdate !== undefined) {
            updateData.preferences = preferencesUpdate;
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.userId },
            data: updateData,
            select: PROFILE_SELECT,
        });
        res.json(formatUserProfileResponse(updatedUser));
    } catch (e) {
        res.status(500).json({ error: "Failed to update profile" });
    }
};

export const changePassword = async (req: Request, res: Response) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

    try {
        const { oldPassword, newPassword } = parsed.data;
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!user) return res.status(404).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid old password" });

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({
            where: { id: req.userId },
            data: { password: hashedPassword },
        });

        res.status(200).json({ message: "Password updated successfully" });
    } catch (e) {
        res.status(500).json({ error: "Failed to change password" });
    }
};

// Vehicle Controllers (using CarOwnership model)
export const listVehicles = async (req: Request, res: Response) => {
    const vehicles = await prisma.carOwnership.findMany({ 
        where: { userId: req.userId },
        include: { car: true }
    });
    res.json(vehicles);
};

export const addVehicle = async (req: Request, res: Response) => {
    // This function is not currently used - frontend uses /car-ownership API instead
    res.status(501).json({ error: "Not implemented - use /car-ownership API instead" });
};

export const getVehicle = async (req: Request, res: Response) => {
    // This function is not currently used - frontend uses /car-ownership API instead
    res.status(501).json({ error: "Not implemented - use /car-ownership API instead" });
};

export const updateVehicle = async (req: Request, res: Response) => {
    // This function is not currently used - frontend uses /car-ownership API instead
    res.status(501).json({ error: "Not implemented - use /car-ownership API instead" });
};

export const deleteVehicle = async (req: Request, res: Response) => {
    // This function is not currently used - frontend uses /car-ownership API instead
    res.status(501).json({ error: "Not implemented - use /car-ownership API instead" });
};

// Payment Method Controllers
export const listPaymentMethods = async (req: Request, res: Response) => {
    const methods = await prisma.paymentMethod.findMany({ where: { userId: req.userId } });
    res.json(methods);
};

export const addPaymentMethod = async (req: Request, res: Response) => {
    const parsed = paymentMethodSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

    const method = await prisma.paymentMethod.create({
        data: { ...parsed.data, userId: req.userId!, status: 'valid' },
    });
    res.status(201).json(method);
};

export const deletePaymentMethod = async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const result = await prisma.paymentMethod.deleteMany({ where: { id, userId: req.userId } });
    if (result.count === 0) return res.status(404).json({ error: "Payment method not found" });
    res.status(204).send();
};