import mongoose from "mongoose";

const PriceDetailSchema = new mongoose.Schema({
    package: { type: String, required: true },  // "Standard (3★)"
    days: { type: Number, required: true },  // 7
    groupSize: { type: String, required: true },  // "Solo" | "2 pax" | "3+ pax"
    tourPrice: { type: Number, required: true },  // 750
    sdf: { type: Number, required: true },  // 150
    totalPerPerson: { type: Number, required: true },  // 900
}, { _id: false });

const PackageSchema = new mongoose.Schema({
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },

    // pricing
    currency: { type: String, default: "NU" },
    priceCents: { type: Number, required: true, min: 0 },
    priceNU: { type: Number, required: true, min: 0 },

    durationDays: { type: Number, required: true, min: 1 },
    durationText: { type: String },                 // "7D/6N"

    // UI fields
    location: { type: String },
    type: { type: String, enum: ["beach", "mountain", "cultural", "adventure", "luxury"], default: "beach" },
    travelers: { type: Number, default: 1 },
    image: { type: String },
    includes: [{ type: String }],               // <— HERE
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    priceDetails: [PriceDetailSchema],
}, { timestamps: true });

export default mongoose.model("Package", PackageSchema);
