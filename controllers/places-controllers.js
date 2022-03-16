const fs = require('fs');

const {validationResult} = require('express-validator');
const mongoose = require("mongoose");

const HttpError = require("../models/http-error");
const getCoordsForAddress = require('../util/location');
const Place = require('../models/place');
const User = require('../models/user');

exports.getPlaceById = async (req, res, next) => {
    const placeId = req.params.pid;

    let place;
    try {
        place = await Place.findById(placeId);
    } catch (e) {
        const error = new HttpError('Something went wrong, could not find a place', 500);
        return next(error);
    }
    if (!place) {
        const error = new HttpError('Could not find a place for the provided id.', 404);
        return next(error);
    }

    res.json({success: true, place: place.toObject({getters: true})});
}

exports.getPlacesByUserId = async (req, res, next) => {
    const userId = req.params.uid;

    let userWithPlaces;
    try {
        userWithPlaces = await User.findById(userId).populate({path: 'places', options: {sort : ({'createdAt': -1})}});
    } catch (e) {
        return next(new HttpError('Something went wrong, could not find places', 500));
    }

    // if (!userWithPlaces || userWithPlaces.places.length === 0) {
    //     return next(new HttpError('Could not find places for the provided user id.', 404));
    // }
    res.json({success: true, places: userWithPlaces.places.map(place => place.toObject({getters: true}))});
}

exports.createPlace = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return next(new HttpError('Invalid inputs passed, please check your data.', 422));
    }
    const {title, description, address} = req.body;

    let coordinates;
    try {
        coordinates = await getCoordsForAddress(address);
    } catch (error) {
        return next(error);
    }

    if(!req.file){
        return next(new HttpError('Invalid inputs passed, please check your data.', 422));
    }

    const createdPlace = new Place({
        title,
        description,
        location: coordinates,
        address,
        image: 'uploads/images/' + req.file.filename,
        creator: req.userData.userId
    })
    try {
        const user = await User.findById(req.userData.userId);
        if (!user) {
            return next(new HttpError('Could not find user for provided id', 404))
        }

        const sess = await mongoose.startSession();
        sess.startTransaction();
        await createdPlace.save({session: sess});
        user.places.push(createdPlace);
        await user.save({session: sess});
        await sess.commitTransaction();
        res.status(201).json({success: true, place: createdPlace});
    } catch (e) {
        console.log(e)
        const error = new HttpError('Creating place failed, please try again.', 500)
        return next(error);
    }
}

exports.updatePlace = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new HttpError('Invalid inputs passed, please check your data.', 422);
    }
    const placeId = req.params.pid;
    const {title, description} = req.body;

    let place;
    try {
        place = await Place.findById(placeId);

        if (!place) {
            const error = new HttpError('Could not find a place for the provided id.', 404);
            return next(error);
        }

        if (place.creator.toString() !== req.userData.userId.toString()) {
            const error = new HttpError('You are not allowed to edit this place.', 401);
            return next(error);
        }

        if(req.file){
            fs.unlink(place.image, err => {
                console.log(err);
            });
            place.image ='uploads/images/' + req.file.filename;
        }

        place.title = title;
        place.description = description;
        await place.save();

        res.status(200).json({success: true, data: place.toObject({getters: true})});
    } catch (e) {
        return next(new HttpError('Something went wrong, could not update a place', 500));
    }

}

exports.deletePlace = async (req, res, next) => {
    const placeId = req.params.pid;
    let place;
    let imagePath;

    try {
        place = await Place.findById(placeId).populate('creator');

        if (!place) {
            return next(new HttpError('Could not find place for this id.', 404));
        }

        if (place.creator.id !== req.userData.userId) {
            const error = new HttpError('You are not allowed to delete this place.', 403);
            return next(error);
        }

        imagePath = place.image;

        const sess = await mongoose.startSession();
        sess.startTransaction();
        await place.remove({session: sess});
        place.creator.places.pull(place);
        await place.creator.save({session: sess});
        await sess.commitTransaction();


    } catch (e) {
        return next(new HttpError('Something went wrong, could not delete a place', 500));
    }

    fs.unlink(imagePath, err => {
        console.log(err);
    });

    res.status(200).json({success: true, message: 'Deleted place.'})
}

