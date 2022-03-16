const {validationResult} = require("express-validator");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const HttpError = require("../models/http-error");
const User = require('../models/user');

exports.getUsers = async (req, res, next) => {
    let users;
    try {
        users = await User.find({}, '-password');
    } catch (e) {
        return next(new HttpError('Fetching users failed, please try again later.', 500))
    }
    res.json({users: users.map(user => user.toObject({getters: true}))})
}

exports.signup = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return next(new HttpError('Invalid inputs passed, please check your data.', 422));
    }
    const {name, email, password} = req.body;

    try {
        const existingUser = await User.findOne({email: email});

        if (existingUser) {
            next(new HttpError('User exists already, please login instead.', 422));
        }

        let hashedPassword;

        hashedPassword = await bcrypt.hash(password, 12);

        const createdUser = new User({
            name,
            email,
            password: hashedPassword,
            image: 'uploads/images/' + req.file.filename,
            places: []
        })

        await createdUser.save();

        const token = jwt.sign(
            {
                userId: createdUser._id,
                email: createdUser.email
            },
            process.env.JWT_KEY,
            {expiresIn: '1h'}
        );

        res.status(201).json({userId: createdUser._id, email: createdUser.email, token: token});
    } catch (e) {
        next(new HttpError('Signing up failed, please try again later.', 500));
    }
}

exports.login = async (req, res, next) => {
    const {email, password} = req.body;

    try {
        const existingUser = await User.findOne({email: email});


        if (!existingUser) {
            const error = new HttpError(
                'Invalid credentials, could not log you in.',
                401
            );
            return next(error);
        }

        const isValidPassword = await bcrypt.compare(password, existingUser.password);

        if (!isValidPassword) {
            const error = new HttpError(
                'Invalid credentials, could not log you in.',
                403
            );
            return next(error);
        }
        const token = jwt.sign(
            {userId: existingUser.id, email: existingUser.email},
            process.env.JWT_KEY,
            {expiresIn: '1h'}
        );

        res.json({
            userId: existingUser.id,
            email: existingUser.email,
            token: token
        });
    } catch (err) {
        const error = new HttpError(
            'Logging in failed, please try again later.',
            500
        );
        return next(error);
    }
}