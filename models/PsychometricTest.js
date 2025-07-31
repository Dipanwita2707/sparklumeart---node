const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PsychometricTestSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    answers: {
        type: Schema.Types.Mixed,
        default: {}
    },
    colorPreference: {
        type: String,
        enum: ['warm', 'cool', 'neutral', 'bold'],
        default: null
    },
    stylePreference: {
        type: String,
        enum: ['modern', 'traditional', 'minimal', 'eclectic'],
        default: null
    },
    personalityTraits: {
        type: [String],
        default: []
    },
    status: {
        type: String,
        enum: ['taken', 'awaiting_payment', 'paid', 'under_review', 'reviewed', 'order_placed', 'in_progress', 'completed'],
        default: 'taken'
    },
    paymentId: {
        type: String,
        default: null
    },
    paymentAmount: {
        type: Number,
        default: null
    },
    paymentDate: {
        type: Date,
        default: null
    },
    psychologistFeedback: {
        text: {
            type: String,
            default: null
        },
        submittedAt: {
            type: Date,
            default: null
        },
        psychologist: {
            type: String,
            default: null
        }
    },
    adminQuote: {
        budget: {
            type: Number,
            default: null
        },
        description: {
            type: String,
            default: null
        },
        submittedAt: {
            type: Date,
            default: null
        }
    },
    order: {
        approved: {
            type: Boolean,
            default: false
        },
        paymentId: {
            type: String,
            default: null
        },
        paymentAmount: {
            type: Number,
            default: null
        },
        paymentDate: {
            type: Date,
            default: null
        },
        status: {
            type: String,
            enum: ['pending', 'placed', 'in_progress', 'completed'],
            default: 'pending'
        },
        address: {
            type: String,
            default: null
        },
        mobileNumber: {
            type: String,
            default: null
        },
        startedAt: {
            type: Date,
            default: null
        },
        completedAt: {
            type: Date,
            default: null
        },
        approvedAt: {
            type: Date,
            default: null
        },
        photos: [{
            type: String
        }],
        publicDisplay: {
            type: Boolean,
            default: false
        },
        publicDescription: {
            type: String,
            default: null
        }
    },
    projectPhotos: [{
        url: {
            type: String,
            required: true
        },
        description: {
            type: String,
            default: ''
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    userFeedback: {
        rating: {
            type: Number,
            min: 1,
            max: 5,
            default: null
        },
        comment: {
            type: String,
            default: null
        },
        submittedAt: {
            type: Date,
            default: null
        }
    }
}, { timestamps: true });

module.exports = mongoose.model('PsychometricTest', PsychometricTestSchema); 