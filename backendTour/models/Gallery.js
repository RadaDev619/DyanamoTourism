import mongoose from "mongoose";

// This schema will store a single document containing the list of all gallery images.
const gallerySchema = new mongoose.Schema(
    {
        // A unique key to ensure we only ever have one gallery document.
        singleton: { type: String, default: "gallery", unique: true },
        images: { type: [String], default: [] },
    },
    { timestamps: true }
);

const Gallery = mongoose.model("Gallery", gallerySchema);
export default Gallery;