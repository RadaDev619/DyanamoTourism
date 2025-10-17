import mongoose from "mongoose";

const testimonialSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        location: {
            type: String,
            required: true,
        },
        package: {
            type: String,
            required: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        text: {
            type: String,
            required: true,
        },
        avatar: {
            type: String,
            required: true, // URL to the avatar image
        },
    },
    {
        timestamps: true,
    }
);

const Testimonial = mongoose.model("Testimonial", testimonialSchema);

export default Testimonial;
