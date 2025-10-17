import mongoose from "mongoose";

// ----- Subdocs -----
const PricingSchema = new mongoose.Schema({
    currency: { type: String, default: "USD" }, // "$" in UI
    packagePriceCents: { type: Number, required: true, min: 0 }, // base package total
    sdfFeeCents: { type: Number, required: true, min: 0 },
    totalPerPersonCents: { type: Number, required: true, min: 0 },
    totalGroupCents: { type: Number, required: true, min: 0 },
}, { _id: false });

const CustomerSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, index: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
}, { _id: false });

const TripSchema = new mongoose.Schema({
    // Single date used by your form + optional start/end used by calculator
    travelDate: { type: Date, required: true },
    startDate: { type: Date }, // optional
    endDate: { type: Date }, // optional
    groupSize: { type: Number, min: 1, default: 1 }, // calculator "Group Size"
    travelers: { type: Number, min: 1, default: 1 }, // booking "Number of Travelers"
    specialRequests: { type: String, default: "" }
}, { _id: false });

// ----- Booking -----
const BookingSchema = new mongoose.Schema({
    package: { type: mongoose.Schema.Types.ObjectId, ref: "Package", required: true, index: true },

    // Freeze some display fields at time of booking so title changes later don't affect receipts
    packageTitleSnapshot: { type: String },

    status: { type: String, enum: ["PENDING", "CONFIRMED", "CANCELLED"], default: "PENDING", index: true },

    customer: CustomerSchema,
    trip: TripSchema,
    pricing: PricingSchema,

    // Where it came from (form vs WhatsApp inquiry button)
    source: { type: String, enum: ["WEB_FORM", "WHATSAPP"], default: "WEB_FORM" },

    // ---- Legacy fields (optional) kept so old code/data won’t break ----
    date: { type: String },                  // legacy "YYYY-MM-DD"
    qty: { type: Number, min: 1 },          // legacy traveler qty
    customerName: { type: String },                  // legacy full name
    customerEmail: { type: String, index: true },
    customerPhone: { type: String },
    totalCents: { type: Number, min: 0 },
    currencyLegacy: { type: String }
}, { timestamps: true });

// Queries: all bookings for a package on a day/by status
BookingSchema.index({ package: 1, "trip.travelDate": 1, status: 1 });

// Nice-to-have: full name virtual for easy display
BookingSchema.virtual("customerFullName").get(function () {
    if (this.customer?.firstName || this.customer?.lastName) {
        return `${this.customer.firstName ?? ""} ${this.customer.lastName ?? ""}`.trim();
    }
    return this.customerName || "";
});

export default mongoose.model("Booking", BookingSchema);
