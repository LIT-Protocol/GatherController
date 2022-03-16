//
// Get a list of space ids that are ready to be deleted
// @param { Array<String } spaceIds in the database
// @param { Array<String> } spaceIds in the running cache
// @return { Array<String> } 
//
export const getDeleteList = (dbList, runningList) => {

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
// Handle space deletion (its wrapper function polls every 60 seconds)
// @param { Function } callback
// @param { Array<String } dbList of spaceIds
// @param { Array<String } runningList of spaceIds
// @return { void }
//
export const handleSpaceDeletion = (callback, dbList, runningList) => {

    if( ! callback ){
        console.error("❌ [ERROR] handleSpaceDeletion must have callback");
        return;
    }
    if( ! dbList ){
        console.error("❌ [ERROR] handleSpaceDeletion must have dbList");
        return;
    }
    if( ! runningList ){
        console.error("❌ [ERROR] handleSpaceDeletion must have runningList");
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