import BaseModel from "./BaseModel.js";

export default class GatherLockedSpaces extends BaseModel{
  static get tableName(){
    return "gather_permitted_areas"
  }
}