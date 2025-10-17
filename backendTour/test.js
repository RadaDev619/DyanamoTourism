// .env (example)
// PORT=4000
// MONGODB_URI=your_mongodb_uri
// JWT_SECRET=change_me
// JWT_EXPIRES_IN=7d

import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

// --- Existing Models ---
import Package from "./models/Package.js";
import Booking from "./models/Booking.js";
import Admin from "./models/admin.js";

// --- New Models ---
import Event from "./models/Event.js";
import Faq from "./models/Faq.js";
import Gallery from "./models/Gallery.js";
import Testimonial from "./models/Testimonial.js";

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const PORT = process.env.PORT || 4000;
const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb+srv://radabisdorji_db_user:3uERWIWgSbsoLiuA@dynamotourism.nrampns.mongodb.net/";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// ---------- Utils ----------
const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const toIsoDateString = (d) => new Date(d).toISOString().slice(0, 10);
const safeNumber = (v) =>
    v === undefined || v === null || v === "" ? null : Number(v);
const parseDurationDays = (durationText) => {
    if (!durationText) return null;
    const m = String(durationText).match(/(\d+)\s*[dD]/);
    return m ? Number(m[1]) : null;
};
const ensurePrices = (payload = {}) => {
    let { priceNU, priceCents } = payload;
    const nu = safeNumber(priceNU);
    const cents = safeNumber(priceCents);
    if (nu == null && cents == null)
        return { ok: false, error: "priceNU or priceCents required" };
    if (nu == null && cents != null)
        return {
            ok: true,
            priceNU: Math.round(cents / 100),
            priceCents: Math.round(cents),
        };
    if (nu != null && cents == null)
        return {
            ok: true,
            priceNU: Math.round(nu),
            priceCents: Math.round(nu * 100),
        };
    return {
        ok: true,
        priceNU: Math.round(nu),
        priceCents: Math.round(cents),
    };
};

// ---------- JWT helpers (Admin) ----------
const signAdminToken = (admin) =>
    jwt.sign(
        {
            sub: String(admin._id),
            role: admin.role,
            email: admin.email,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

const authAdmin = async (req, res, next) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const admin = await Admin.findById(payload.sub);
        if (!admin || !admin.isActive)
            return res.status(401).json({ error: "Invalid token" });
        req.admin = admin;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
};

// ---------- Connect ----------
await mongoose.connect(MONGODB_URI);
console.log("Mongo connected");

// ---------- Admin Auth ----------
app.post("/api/admin/register", async (req, res) => {
    try {
        const { firstName, lastName, email, password, role } = req.body || {};
        if (!firstName || !lastName || !email || !password) {
            return res
                .status(400)
                .json({ error: "firstName, lastName, email, password are required" });
        }
        if (String(password).length < 8) {
            return res
                .status(400)
                .json({ error: "Password must be at least 8 characters" });
        }

        const admin = new Admin({
            firstName,
            lastName,
            email,
            role: role || "ADMIN",
            passwordHash: "temp",
        });
        admin.password = password;
        await admin.save();

        const token = signAdminToken(admin);
        res.status(201).json({ token, admin: admin.toJSON() });
    } catch (e) {
        if (e?.code === 11000 || String(e).includes("duplicate key")) {
            return res.status(409).json({ error: "Email already registered" });
        }
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

app.post("/api/admin/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password)
            return res.status(400).json({ error: "email and password are required" });

        const admin = await Admin.findOne({ email }).select("+passwordHash");
        if (!admin) return res.status(401).json({ error: "Invalid credentials" });
        if (admin.isLocked)
            return res.status(423).json({ error: "Account locked. Try again later." });
        if (!admin.isActive)
            return res.status(403).json({ error: "Account disabled" });

        const ok = await admin.comparePassword(password);
        if (!ok) {
            await admin.incLoginAttempts();
            return res.status(401).json({ error: "Invalid credentials" });
        }

        admin.recordSuccessfulLogin();
        await admin.save();

        const token = signAdminToken(admin);
        res.json({ token, admin: admin.toJSON() });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/admin/me", authAdmin, async (req, res) => {
    res.json({ admin: req.admin.toJSON() });
});

// ---------- Packages ----------
app.get("/api/packages", async (_req, res) => {
    const rows = await Package.find().sort({ createdAt: -1 }).lean();
    res.json(rows);
});

app.get("/api/packages/:slug", async (req, res) => {
    const pkg = await Package.findOne({ slug: req.params.slug }).lean();
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    res.json(pkg);
});

app.post("/api/packages", authAdmin, async (req, res) => {
    try {
        const {
            slug,
            title,
            description,
            currency = "NU",
            durationDays,
            durationText,
            location,
            type,
            travelers,
            image,
            includes,
            rating,
            priceDetails,
        } = req.body || {};

        if (!slug || !title || !description) {
            return res
                .status(400)
                .json({ error: "slug, title, description are required" });
        }

        const priceResult = ensurePrices(req.body);
        if (!priceResult.ok)
            return res.status(400).json({ error: priceResult.error });

        let finalDurationDays = safeNumber(durationDays);
        if (!finalDurationDays) {
            const parsed = parseDurationDays(durationText);
            if (!parsed)
                return res.status(400).json({
                    error: "durationDays or durationText (like '7D/6N') required",
                });
            finalDurationDays = parsed;
        }

        const includesArr = Array.isArray(includes)
            ? includes
            : typeof includes === "string"
                ? includes
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [];

        const doc = await Package.create({
            slug,
            title,
            description,
            currency,
            priceCents: priceResult.priceCents,
            priceNU: priceResult.priceNU,
            durationDays: finalDurationDays,
            durationText:
                durationText ||
                `${finalDurationDays}D/${Math.max(finalDurationDays - 1, 0)}N`,
            location,
            type,
            travelers,
            image,
            includes: includesArr,
            rating,
            priceDetails,
        });

        res.status(201).json({ id: doc._id, slug: doc.slug });
    } catch (e) {
        if (String(e).includes("duplicate key")) {
            return res.status(409).json({ error: "Slug already exists" });
        }
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
});

app.patch("/api/packages/:slug", authAdmin, async (req, res) => {
    const allowed = [
        "title",
        "description",
        "currency",
        "durationDays",
        "durationText",
        "location",
        "type",
        "travelers",
        "image",
        "includes",
        "rating",
        "priceDetails",
        "priceNU",
        "priceCents",
    ];

    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];

    if ("priceNU" in patch || "priceCents" in patch) {
        const priceResult = ensurePrices(patch);
        if (!priceResult.ok)
            return res.status(400).json({ error: priceResult.error });
        patch.priceNU = priceResult.priceNU;
        patch.priceCents = priceResult.priceCents;
    }

    if (!("durationDays" in patch) && "durationText" in patch) {
        const parsed = parseDurationDays(patch.durationText);
        if (parsed) patch.durationDays = parsed;
    }

    if (
        "includes" in patch &&
        !Array.isArray(patch.includes) &&
        typeof patch.includes === "string"
    ) {
        patch.includes = patch.includes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }

    const updated = await Package.findOneAndUpdate(
        { slug: req.params.slug },
        patch,
        { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Package not found" });
    res.json({ ok: true });
});

app.delete("/api/packages/:slug", authAdmin, async (req, res) => {
    try {
        const { slug } = req.params;
        const deleted = await Package.findOneAndDelete({ slug });
        if (!deleted) return res.status(404).json({ error: "Package not found" });

        return res.status(200).json({
            ok: true,
            deletedPackageId: String(deleted._id),
            slug: deleted.slug,
        });
    } catch (e) {
        console.error("Delete package error:", e);
        return res.status(500).json({ error: "Failed to delete package" });
    }
});


// ---------- Events ----------
app.get("/api/events", async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 });
        res.json(events);
    } catch (e) {
        console.error("Get events error:", e);
        res.status(500).json({ error: "Failed to retrieve events" });
    }
});

app.post("/api/events", authAdmin, async (req, res) => {
    try {
        const event = await Event.create(req.body);
        res.status(201).json(event);
    } catch (e) {
        console.error("Create event error:", e);
        if (e.name === "ValidationError") {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: "Failed to create event" });
    }
});

app.delete("/api/events/:id", authAdmin, async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }
        res.json({ ok: true, message: "Event deleted successfully" });
    } catch (e) {
        console.error("Delete event error:", e);
        res.status(500).json({ error: "Failed to delete event" });
    }
});


// ---------- FAQs ----------
app.get("/api/faqs", async (req, res) => {
    try {
        const faqs = await Faq.find().sort({ createdAt: 1 });
        res.json(faqs);
    } catch (e) {
        console.error("Get FAQs error:", e);
        res.status(500).json({ error: "Failed to retrieve FAQs" });
    }
});

app.post("/api/faqs", authAdmin, async (req, res) => {
    try {
        const { question, answer } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ error: "Question and answer are required" });
        }
        const faq = await Faq.create({ question, answer });
        res.status(201).json(faq);
    } catch (e) {
        console.error("Create FAQ error:", e);
        if (e.name === "ValidationError") {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: "Failed to create FAQ" });
    }
});

app.delete("/api/faqs/:id", authAdmin, async (req, res) => {
    try {
        const faq = await Faq.findByIdAndDelete(req.params.id);
        if (!faq) {
            return res.status(404).json({ error: "FAQ not found" });
        }
        res.json({ ok: true, message: "FAQ deleted successfully" });
    } catch (e) {
        console.error("Delete FAQ error:", e);
        res.status(500).json({ error: "Failed to delete FAQ" });
    }
});

// ---------- Gallery ----------
app.get("/api/gallery", async (req, res) => {
    try {
        const gallery = await Gallery.findOne({ singleton: "gallery" });
        res.json(gallery ? gallery.images : []);
    } catch (e) {
        console.error("Get gallery error:", e);
        res.status(500).json({ error: "Failed to retrieve gallery images" });
    }
});

app.post("/api/gallery/images", authAdmin, async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ error: "imageUrl is required" });
        }
        const gallery = await Gallery.findOneAndUpdate(
            { singleton: "gallery" },
            { $push: { images: imageUrl } },
            { new: true, upsert: true }
        );
        res.status(201).json(gallery.images);
    } catch (e) {
        console.error("Add gallery image error:", e);
        res.status(500).json({ error: "Failed to add image to gallery" });
    }
});

app.delete("/api/gallery/images", authAdmin, async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ error: "imageUrl is required" });
        }
        const gallery = await Gallery.findOneAndUpdate(
            { singleton: "gallery" },
            { $pull: { images: imageUrl } },
            { new: true }
        );
        if (!gallery) {
            return res.status(404).json({ error: "Gallery not found" });
        }
        res.json({ ok: true, message: "Image deleted successfully", images: gallery.images });
    } catch (e) {
        console.error("Delete gallery image error:", e);
        res.status(500).json({ error: "Failed to delete image from gallery" });
    }
});


// ---------- Testimonials ----------
app.get("/api/testimonials", async (req, res) => {
    try {
        const testimonials = await Testimonial.find().sort({ createdAt: -1 });
        res.json(testimonials);
    } catch (e) {
        console.error("Get testimonials error:", e);
        res.status(500).json({ error: "Failed to retrieve testimonials" });
    }
});

app.post("/api/testimonials", authAdmin, async (req, res) => {
    try {
        const testimonial = await Testimonial.create(req.body);
        res.status(201).json(testimonial);
    } catch (e) {
        console.error("Create testimonial error:", e);
        if (e.name === "ValidationError") {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: "Failed to create testimonial" });
    }
});

app.delete("/api/testimonials/:id", authAdmin, async (req, res) => {
    try {
        const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
        if (!testimonial) {
            return res.status(404).json({ error: "Testimonial not found" });
        }
        res.json({ ok: true, message: "Testimonial deleted successfully" });
    } catch (e) {
        console.error("Delete testimonial error:", e);
        res.status(500).json({ error: "Failed to delete testimonial" });
    }
});


// ---------- Bookings ----------
app.get("/api/bookings", authAdmin, async (req, res) => {
    const { email } = req.query;
    const query = {};
    if (email) {
        query.$or = [{ customerEmail: email }, { "customer.email": email }];
    }
    const rows = await Booking.find(query).sort({ createdAt: -1 }).lean();
    res.json(rows);
});

app.post("/api/bookings", async (req, res) => {
    try {
        const body = req.body || {};

        // 1) Validation
        const pkg = await Package.findOne({ slug: body.package_slug });
        if (!pkg) return res.status(404).json({ error: "Package not found" });
        if (!body.trip || !body.trip.travelDate) {
            return res.status(400).json({ error: "Travel date is required" });
        }

        const travelersCount = safeNumber(body?.trip?.travelers) || 1;
        if (!Number.isInteger(travelersCount) || travelersCount <= 0) {
            return res.status(400).json({ error: "Invalid number of travelers" });
        }

        // 2) Prepare Booking Document
        const dateStr = toIsoDateString(body.trip.travelDate);
        const pricing = body.pricing || {};
        const currency = pricing.currency || pkg.currency || "USD";
        const fallbackTotal =
            travelersCount * (pkg.priceCents ?? pkg.priceNU * 100 ?? 0);

        const finalPricing = {
            currency,
            packagePriceCents: safeNumber(pricing.packagePriceCents) ?? fallbackTotal,
            sdfFeeCents: safeNumber(pricing.sdfFeeCents) ?? 0,
            totalPerPersonCents:
                safeNumber(pricing.totalPerPersonCents) ??
                Math.round(fallbackTotal / travelersCount),
            totalGroupCents: safeNumber(pricing.totalGroupCents) ?? fallbackTotal,
        };

        const createdBooking = await Booking.create({
            package: pkg._id,
            packageTitleSnapshot: body.packageTitleSnapshot || pkg.title,
            status: "PENDING",
            customer: {
                firstName: body?.customer?.firstName || "",
                lastName: body?.customer?.lastName || "",
                email: body?.customer?.email,
                phone: body?.customer?.phone || "",
            },
            trip: {
                travelDate: new Date(body.trip.travelDate),
                travelers: travelersCount,
                specialRequests: body.trip.specialRequests || "",
            },
            pricing: finalPricing,
            source: body.source || "WEB_FORM",
        });

        // 4) Send Response
        res.status(201).json({
            bookingId: createdBooking._id,
            status: createdBooking.status,
            currency: createdBooking.pricing.currency,
            date: dateStr,
            travelers: travelersCount,
        });
    } catch (e) {
        console.error("Booking Error:", e);
        res
            .status(500)
            .json({ error: "An unexpected error occurred while creating the booking." });
    }
});

// Confirm booking (no email)
app.patch("/api/bookings/:id/confirm", authAdmin, async (req, res) => {
    try {
        const { reason } = req.body || {};

        const updated = await Booking.findByIdAndUpdate(
            req.params.id,
            {
                status: "CONFIRMED",
                ...(reason ? { adminReason: reason } : {}),
                updatedAt: new Date(),
            },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: "Booking not found" });

        res.json({ ok: true, booking: updated });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to confirm booking" });
    }
});

// Reject booking (no email)
app.patch("/api/bookings/:id/reject", authAdmin, async (req, res) => {
    try {
        const { reason } = req.body || {};

        const updated = await Booking.findByIdAndUpdate(
            req.params.id,
            {
                status: "REJECTED",
                ...(reason ? { adminReason: reason } : {}),
                updatedAt: new Date(),
            },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: "Booking not found" });

        res.json({ ok: true, booking: updated });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to reject booking" });
    }
});

// Cancel booking
app.patch("/api/bookings/:id/cancel", authAdmin, async (req, res) => {
    const updated = await Booking.findByIdAndUpdate(
        req.params.id,
        { status: "CANCELLED" },
        { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Booking not found" });
    res.json({ ok: true });
});

// ---------- Stats / Analytics ----------

// 1) Total number of packages
app.get("/api/stats/total-packages", authAdmin, async (_req, res) => {
    try {
        const total = await Package.countDocuments();
        res.json({ total });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to get total packages" });
    }
});

// 2) Total number of confirmed bookings
app.get("/api/stats/confirmed-bookings", authAdmin, async (_req, res) => {
    try {
        const total = await Booking.countDocuments({ status: "CONFIRMED" });
        res.json({ total });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to get confirmed bookings" });
    }
});

// 3) Total revenue from all confirmed bookings (per currency)
app.get("/api/stats/total-revenue", authAdmin, async (_req, res) => {
    try {
        const rows = await Booking.aggregate([
            { $match: { status: "CONFIRMED" } },
            {
                $group: {
                    _id: "$pricing.currency",
                    totalCents: { $sum: { $ifNull: ["$pricing.totalGroupCents", 0] } },
                    bookings: { $sum: 1 },
                },
            },
            { $sort: { totalCents: -1 } },
        ]);

        const byCurrency = rows.map((r) => ({
            currency: r._id || "UNKNOWN",
            totalCents: r.totalCents,
            amount: Math.round((r.totalCents || 0) / 100),
            bookings: r.bookings,
        }));

        const overallCents = byCurrency.reduce((s, r) => s + (r.totalCents || 0), 0);

        res.json({
            byCurrency,
            overallCents,
            overallAmount: Math.round(overallCents / 100),
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to compute total revenue" });
    }
});

// 4) Total customers (sum of travelers) from all confirmed bookings
app.get("/api/stats/total-customers", authAdmin, async (_req, res) => {
    try {
        const rows = await Booking.aggregate([
            { $match: { status: "CONFIRMED" } },
            {
                $group: {
                    _id: null,
                    travelers: { $sum: { $ifNull: ["$trip.travelers", 0] } },
                    bookings: { $sum: 1 },
                },
            },
        ]);
        const totalTravelers = rows[0]?.travelers ?? 0;
        res.json({ totalTravelers, bookings: rows[0]?.bookings ?? 0 });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to compute total customers" });
    }
});

// 5) Most booked package (by confirmed bookings; tie-breaker: travelers)
app.get("/api/stats/most-booked-package", authAdmin, async (_req, res) => {
    try {
        const rows = await Booking.aggregate([
            { $match: { status: "CONFIRMED" } },
            {
                $group: {
                    _id: "$package",
                    bookings: { $sum: 1 },
                    travelers: { $sum: { $ifNull: ["$trip.travelers", 0] } },
                },
            },
            { $sort: { bookings: -1, travelers: -1 } },
            { $limit: 1 },
            {
                $lookup: {
                    from: "packages",
                    localField: "_id",
                    foreignField: "_id",
                    as: "package",
                },
            },
            { $unwind: "$package" },
            {
                $project: {
                    _id: 0,
                    packageId: "$package._id",
                    slug: "$package.slug",
                    title: "$package.title",
                    image: "$package.image",
                    bookings: 1,
                    travelers: 1,
                },
            },
        ]);

        if (!rows.length) return res.json({ message: "No confirmed bookings yet" });
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to get most booked package" });
    }
});

// 6) Revenue by month from confirmed bookings (grouped by currency)
//    ?from=YYYY-MM-DD&to=YYYY-MM-DD to bound by confirmation time window
app.get("/api/stats/revenue-by-month", authAdmin, async (req, res) => {
    try {
        const { from, to } = req.query;
        const match = { status: "CONFIRMED" };
        if (from || to) {
            match.updatedAt = {};
            if (from) match.updatedAt.$gte = new Date(from);
            if (to) match.updatedAt.$lt = new Date(to);
        }

        const rows = await Booking.aggregate([
            { $match: match },
            {
                $addFields: {
                    confirmMonth: {
                        $dateToString: { date: "$updatedAt", format: "%Y-%m" },
                    },
                },
            },
            {
                $group: {
                    _id: { month: "$confirmMonth", currency: "$pricing.currency" },
                    totalCents: { $sum: { $ifNull: ["$pricing.totalGroupCents", 0] } },
                    bookings: { $sum: 1 },
                },
            },
            { $sort: { "_id.month": 1, "_id.currency": 1 } },
            {
                $project: {
                    _id: 0,
                    month: "$_id.month",
                    currency: "$_id.currency",
                    totalCents: 1,
                    amount: { $round: [{ $divide: ["$totalCents", 100] }, 0] },
                    bookings: 1,
                },
            },
        ]);

        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to compute revenue by month" });
    }
});

// (Optional) One-shot overview with key stats
app.get("/api/stats/overview", authAdmin, async (_req, res) => {
    try {
        const [
            totalPackages,
            totalConfirmed,
            totalCustomersAgg,
            totalRevenueAgg,
            mostBookedAgg,
        ] = await Promise.all([
            Package.countDocuments(),
            Booking.countDocuments({ status: "CONFIRMED" }),
            Booking.aggregate([
                { $match: { status: "CONFIRMED" } },
                {
                    $group: {
                        _id: null,
                        travelers: { $sum: { $ifNull: ["$trip.travelers", 0] } },
                    },
                },
            ]),
            Booking.aggregate([
                { $match: { status: "CONFIRMED" } },
                {
                    $group: {
                        _id: "$pricing.currency",
                        totalCents: {
                            $sum: { $ifNull: ["$pricing.totalGroupCents", 0] },
                        },
                        bookings: { $sum: 1 },
                    },
                },
                { $sort: { totalCents: -1 } },
            ]),
            Booking.aggregate([
                { $match: { status: "CONFIRMED" } },
                {
                    $group: {
                        _id: "$package",
                        bookings: { $sum: 1 },
                        travelers: { $sum: { $ifNull: ["$trip.travelers", 0] } },
                    },
                },
                { $sort: { bookings: -1, travelers: -1 } },
                { $limit: 1 },
                {
                    $lookup: {
                        from: "packages",
                        localField: "_id",
                        foreignField: "_id",
                        as: "package",
                    },
                },
                { $unwind: "$package" },
                {
                    $project: {
                        _id: 0,
                        packageId: "$package._id",
                        slug: "$package.slug",
                        title: "$package.title",
                        image: "$package.image",
                        bookings: 1,
                        travelers: 1,
                    },
                },
            ]),
        ]);

        const totalCustomers = totalCustomersAgg[0]?.travelers ?? 0;
        const revenueByCurrency = totalRevenueAgg.map((r) => ({
            currency: r._id || "UNKNOWN",
            totalCents: r.totalCents,
            amount: Math.round((r.totalCents || 0) / 100),
            bookings: r.bookings,
        }));
        const overallCents = revenueByCurrency.reduce(
            (s, r) => s + (r.totalCents || 0),
            0
        );

        res.json({
            totals: {
                packages: totalPackages,
                confirmedBookings: totalConfirmed,
                customers: totalCustomers,
            },
            revenue: {
                byCurrency: revenueByCurrency,
                overallCents,
                overallAmount: Math.round(overallCents / 100),
            },
            mostBookedPackage: mostBookedAgg[0] || null,
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to compute overview" });
    }
});

// ---------- Health ----------
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- STATIC FILES (frontend) ----------
// serve the folder ONE LEVEL ABOVE backendTour (where index.html lives)
const publicRoot = path.join(__dirname, "..");
app.use(express.static(publicRoot));

// send index.html for any non-API route (client-side routing / direct links)
app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(publicRoot, "index.html"));
});


// app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));

app.listen(PORT, "0.0.0.0", () => {
    console.log(`API running on http://0.0.0.0:${PORT}`);
});