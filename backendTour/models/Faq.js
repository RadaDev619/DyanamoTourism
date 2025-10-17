// models/Faq.js

import mongoose from "mongoose";

const faqSchema = new mongoose.Schema(
    {
        question: {
            type: String,
            required: [true, "A question is required."],
            trim: true,
        },
        answer: {
            type: String,
            required: [true, "An answer is required."],
            trim: true,
        },
    },
    {
        // This option adds `createdAt` and `updatedAt` fields to the document
        timestamps: true,
    }
);

const Faq = mongoose.model("Faq", faqSchema);

export default Faq;