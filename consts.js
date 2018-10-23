
function exportConsts(scope)
{
    scope.SIZE_SCALE = 0.5; //general game size multiplier (smaller = easier graphics rendering)
    scope.CAPTURE_TIME = 3; //number of seconds it takes 10 units to capture a level 1 node
    scope.FIGHT_TIME = 1; //amount of time between each round of fight with 10 units
    scope.SPAWN_TIME = 1.2; //amount of seconds it takes to spawn 1 unit at baseline
    scope.UNITS_PER_LEVEL = 10; //population capacity granted for each level of node controlled
    scope.REINFORCEMENT_TIME = 2; //amount of time it takes to build each unit of reinforcements
    scope.REINFORCEMENT_CAP = 100; //bonus unit cap for each team
    scope.FIGHT_SPAWN_MULTIPLIER = 1; //multiplier to spawning times while a node is in combat
    scope.MOVE_SPEED = 250*scope.SIZE_SCALE; //number of pixels moved in a second
    scope.MAX_RANGE = 800*scope.SIZE_SCALE;//maximum range of a movingUnit group (currently only used by AI)
    scope.CONTROL_RANGE = 500*scope.SIZE_SCALE; //range from each node before units suffer attrition
    scope.ATRIT_RATE = 1000*scope.SIZE_SCALE; //amount of pixels a group suffering attrition moves before suffering 50% losses
    scope.NODE_ATRIT_TIME = 1; //amount of time between each attrition of a node with 10 units above maximum
    scope.MAX_UNITS = 100; //maximum units in one stack before attrition occurs
    scope.UNITS_PER_SPAWN_MULTIPLIER = 100; //number of units at which base spawn times are doubled
    scope.HASH_SIZE = 250 //size of each hash grid
    scope.TURRET_RANGE = 1000*scope.SIZE_SCALE //range of turrets
    scope.TURRET_ROF = 10; //amount of shots each turret can take per second
    scope.FACTORY_PRODUCTION = 3; //amount of units factories produce per second
    scope.fontSize = 16; //base font size  
    /*testing config
    scope.MAP_SIZE = 1000;
    scope.MIN_NODES_TO_GENERATE = 10;
    scope.MAX_NODES_TO_GENERATE = 10;
    scope.FACTORIES_TO_GENERATE = 1; //amount of factories to place on the map
    scope.PORTALS_TO_GENERATE = 1; //amount of portals to place on the map
    scope.TURRETS_TO_GENERATE = 1; //amount of turrets to place on the map
    scope.BOT_COUNT = 0;
    /**/
    /*small map
    scope.BOT_COUNT = 5; //recommended amount of AI teams
    scope.MAP_SIZE = 5000*scope.SIZE_SCALE; //height and width of the map
    scope.MIN_NODES_TO_GENERATE = 100; //minimum amount of nodes generated
    scope.MAX_NODES_TO_GENERATE = 150; //maximum amount of nodes generated
    scope.FACTORIES_TO_GENERATE = 1; //amount of factories to place on the map
    scope.PORTALS_TO_GENERATE = 1; //amount of portals to place on the map
    scope.TURRETS_TO_GENERATE = 3; //amount of turrets to place on the map
    /**/
    /*large map*/
    scope.BOT_COUNT = 20; //recommended amount of AI teams
    scope.MAP_SIZE = 10000*scope.SIZE_SCALE; //height and width of the map
    scope.MIN_NODES_TO_GENERATE = 200//300; //minimum amount of nodes generated
    scope.MAX_NODES_TO_GENERATE = 200//400; //maximum amount of nodes generated
    scope.FACTORIES_TO_GENERATE = 6; //amount of factories to place on the map
    scope.PORTALS_TO_GENERATE = 4; //amount of portals to place on the map
    scope.TURRETS_TO_GENERATE = 10; //amount of turrets to place on the map
    /**/
    /*massive map
    scope.BOT_COUNT = 100; //recommended amount of AI teams
    scope.MAP_SIZE = 20000*scope.SIZE_SCALE; //height and width of the map
    scope.MIN_NODES_TO_GENERATE = 1000; //minimum amount of nodes generated
    scope.MAX_NODES_TO_GENERATE = 1000; //maximum amount of nodes generated
    scope.FACTORIES_TO_GENERATE = 10; //amount of factories to place on the map
    scope.PORTALS_TO_GENERATE = 10; //amount of portals to place on the map
    scope.TURRETS_TO_GENERATE = 20; //amount of turrets to place on the map
    /**/
}
if (typeof module === 'undefined')
    exportConsts(window)
else
    module.exports = exportConsts