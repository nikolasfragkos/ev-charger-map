import { Request, Response } from 'express';
import prisma from '../prisma/client.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import stripe from '../services/stripe.ts';

// Validation schema for signup
const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

// Validation schema for signin
const signinSchema = z.object({
    email: z.email(),
    password: z.string(),
});

export const signUp = async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const { email, password, firstName, lastName, phone } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const stripeCustomer = await stripe.customers.create({
      email,
      metadata: { appUserEmail: email },
    });

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        stripeCustomerId: stripeCustomer.id,
        firstName,
        lastName,
        phone,
      },
    });

    res.status(201).json({
        message: "User created successfully",
        userId: user.id
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const signIn = async (req: Request, res: Response) => {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: z.treeifyError(parsed.error) });
    }

    try {
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);

        if (!isPasswordCorrect) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET || 'a-very-secret-key',
            { expiresIn: '24h' }
        );

        res.status(200).json({ token });

    } catch (err) {
        console.error('Signin error:', err);
        res.status(500).json({ error: 'Authentication failed' });
    }
}