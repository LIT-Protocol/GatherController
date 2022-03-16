import fetch from 'node-fetch';

//
// Get a list of space ids that are ready to be deleted
// @param { Array<String } spaceIds in the database
// @param { Array<String> } spaceIds in the running cache
// @return { Array<String> } 
//
export const getDeleteList = (dbList, runningList) => {

    if( ! dbList ){
        console.error("❌ [ERROR] getDeleteList must have dbList");
        return;
    }
    if( ! runningList ){
        console.error("❌ [ERROR] getDeleteList must have runningList");
        return;
    }

    let instances = [];

    runningList.forEach((runningSpaceId, i) => {
        
        // if the running instance is not in the database
        if( ! dbList.includes(runningSpaceId) ){
            instances.push(runningSpaceId);
        }

    })

    return instances;
};

//
// Check if a space deleted (its wrapper function polls every 60 seconds)
// @param { Function } callback
// @param { Array<String } dbList of spaceIds
// @param { Array<String } runningList of spaceIds
// @return { void }
//
export const checkSpaceDeletion = (callback, dbList, runningList) => {

    if( ! callback ){
        console.error("❌ [ERROR] checkSpaceDeletion must have callback");
        return;
    }
    if( ! dbList ){
        console.error("❌ [ERROR] checkSpaceDeletion must have dbList");
        return;
    }
    if( ! runningList ){
        console.error("❌ [ERROR] checkSpaceDeletion must have runningList");
        return;
    }

    console.log("👀 Checking if there's any deleted space");

    // console.log("dbList:", dbList);
    // console.log("runningList:", runningList);
    
    const deleteList = getDeleteList(dbList, runningList);
    
    if(deleteList.length <= 0){
        console.log("✅ No spaces were deleted.");
        return;
    }
    
    console.log("...🗑️  Instances to be deleted:", deleteList);
    
    deleteList.forEach((deleteSpaceId) => {
        console.log("...🗑️  Deleting", deleteSpaceId);
        var deleteIndex = runningList.findIndex((item) => item == deleteSpaceId);
    
        callback(deleteIndex);
    });
      
}

// export const checkNewInGameAuthed = () => {

// }

// ======================================================
// +                 General Helpers                    +
// ======================================================
//
// Turn (String) '18,24' into Array [18, 24]
// @param { String } coordinates '18, 24'
// @return { Array } [18, 24]
//
export const coordinatesStringToArray = (coordinates) => {
    return (coordinates.replaceAll(' ', '')).split(',').map((coor) => parseInt(coor))
};
  
//
// Get center coordinates of a restricted area 
// by topLeft and bottomRight
// @param { Object } area | restricted area
// @return { centerX, center Y} int, int
//
export const getCenter = (area) => {
    const offsetX = (coordinatesStringToArray(area.bottomRight)[0] - coordinatesStringToArray(area.topLeft)[0]) / 2;
    const offsetY = (coordinatesStringToArray(area.bottomRight)[1] - coordinatesStringToArray(area.topLeft)[1]) / 2;
    const centerX = coordinatesStringToArray(area.topLeft)[0] + offsetX;
    const centerY = coordinatesStringToArray(area.topLeft)[1] + offsetY;

    return { centerX, centerY } 
}

//
// Get instances' space id as array
// @param { Array<Game> } running instances
//
export const mapInstancesToSpaces = (runningInstances) =>{
    return runningInstances.map((instance) => instance.engine.spaceId.replaceAll('\\', '/'));
}

// ======================================================
// +                  Gather Helper                     +
// ======================================================

//
// (GET) Check if a space exists
// @param { String } spaceId
// @return { Boolean } 
//
export const isSpaceExists = async (spaceId) => {
    const data = await fetch('https://api.gather.town/api/getRoomInfo?room=' + spaceId);
    return data.status == 200;
}