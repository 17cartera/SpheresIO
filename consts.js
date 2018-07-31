
function exportConsts(scope)
{
    scope.SIZE_SCALE = 0.5 //general game size multiplier
    scope.CAPTURE_TIME = 3//5; //number of seconds it takes 10 units to capture a level 1 node
    scope.SPAWN_TIME = 2.5//5; //number of seconds it takes for a level 1 node to spawn a unit
    scope.UNITS_PER_LEVEL = 10//5; //population capacity granted for each level
    scope.FIGHT_TIME = 0.8; //amount of time between each round of fight with 10 units
    scope.FIGHT_SPAWN_MULTIPLIER = 2; //multiplier to spawning times while a node is in combat
    scope.MOVE_SPEED = 250*scope.SIZE_SCALE; //number of pixels moved in a second
    /*small map*/
    scope.MAP_SIZE = 5000*scope.SIZE_SCALE; //height and width of the map
    scope.MIN_NODES_TO_GENERATE = 125; //minimum amount of nodes generated
    scope.MAX_NODES_TO_GENERATE = 175; //maximum amount of nodes generated
    /*large map
    scope.MAP_SIZE = 10000*scope.SIZE_SCALE; //height and width of the map
    scope.MIN_NODES_TO_GENERATE = 400; //minimum amount of nodes generated
    scope.MAX_NODES_TO_GENERATE = 600; //maximum amount of nodes generated
    */
    scope.TEAMS_TO_GENERATE = 5; //amount of AI teams to generate at the start of the game
    scope.MAX_RANGE = 500*scope.SIZE_SCALE;//1000*scope.SIZE_SCALE; //maximum range of a movingUnit group (currently only used by AI)
    scope.CONTROL_RANGE = 500*scope.SIZE_SCALE; //range from each node before units suffer attrition
    scope.ATRIT_RATE = 1000*scope.SIZE_SCALE; //amount of pixels a group suffering attrition moves before suffering 50% losses
    scope.HASH_SIZE = MAX_RANGE/2; //size of each hash grid
    scope.fontSize = 16; //base font size
}
if (typeof module === 'undefined')
    exportConsts(window)
else
    module.exports = exportConsts