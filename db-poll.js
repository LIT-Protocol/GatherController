import { Model } from "objection";
import Knex from "knex";
import knexConfig from "./knexfile.js";
import Queue from "./models/Queue.js";
import GatherPermittedAreas from "./models/GatherPermittedAreas.js";

// Initialize knex.
const knex = Knex(knexConfig[process.env.NODE_ENV || "development"]);

// Give the knex instance to objection.
Model.knex(knex);

const userRestrictedCoordinatesCache = {};

//
// Get permitted areas from database
// @param { String } wallet address
// @param { String } spaceId
// @return { Array } permitted areas
//
const getPermittedAreas = async (walletAddress, spaceId) => {
    
    let permitted_areas = await GatherPermittedAreas.query().findOne({
        wallet_address: walletAddress,
        space_id: spaceId
    });

    permitted_areas = permitted_areas?.permitted_areas;
    permitted_areas = JSON.parse(permitted_areas);

    return permitted_areas;
}

// 
// Check every second if there's a new job in the queue table
// if so then update the userRestrictedCoordinatesCache
//
setInterval(async () => {

    const pendingList = await Queue.query().where({
        service_name: 'gather',
        status: 'pending',
    });

    console.log('-----');
    console.log(`Pending List: Found ${pendingList.length}`);

    pendingList.forEach(async (item) => {
        console.log(`message: ${item.message}`);

        const message = item.message.split(':');
        const action = message[0];
        const walletAddress = message[1];
        const spaceId = message[2];
        const playerId = message[3];

        if(action == 'check'){
            
            // == do your thing here
            // -- @required walletAddress
            // -- @required spaceId
            // -- @required playerId
            const permitted_areas = await getPermittedAreas(walletAddress, spaceId)

            if(! userRestrictedCoordinatesCache[playerId]){
                userRestrictedCoordinatesCache[playerId] = {}
            }

            permitted_areas.forEach((area) => {
                userRestrictedCoordinatesCache[playerId][area] = true;
            });

            console.log("userRestrictedCoordinatesCache:", userRestrictedCoordinatesCache);
            
            // == set state to `completed`
            const row = await Queue.query().where({id: item.id}).first();
            console.log("Row:", row);
            await row.patch({status: 'completed'})
        }
    })

}, 1000)