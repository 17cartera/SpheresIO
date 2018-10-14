"use strict"
//spheres IO client code
var gameBoard; var graphics; var leaderBoard; //controller objects
var unitCounter = document.getElementById("popCounter") //lists the units and population limit for the player
var canvas = document.getElementById("viewport"); //the canvas used for the main board
var draw = canvas.getContext("2d"); //the drawing context used for draw actions
var unitSlider = document.getElementById("unitSlider") //slider for the percentage units sent per move order
var unitValue = document.getElementById("unitValue") //value for unitSlider
var gameMap = new GameMap(); //an array of all nodes
var movingUnits = []; //an array of all MovingUnit groups
var teams = {}; //a list of all teams
//teams.push(new Team("rgb(128,128,128)",new Controller())); //neutral team
var playerNameIndex = undefined; //the index of the player's team
//event listener
var player;
//server connection
var socket;
//initialization block
var initialize = function() 
{
	console.log("beginning game");
	document.getElementById("title").style.visibility = "hidden";
	document.getElementById("leaderboard").style.visibility = "visible";
	document.getElementById("popCounter").style.visibility = "visible";
	///new netcode elements
	socket = io.connect(location.host)
	//socket = io.connect('http://'+SERVER_IP+':80');
	socket.on('connect', function(data) 
	{
		console.log("Client connected");
		socket.emit('join', 'ClientStuff');
	});
	socket.on('disconnect', function(data)
	{
		console.log("Client disconnected");
		handleDisconnect()
	})
	socket.on('teams', function(data)
	{
		updateTeams(data)
	});
	socket.on('map', function(data) 
	{
		updateGameMap(data)
	});
	socket.on('groups',function(data)
	{
		updateMovingGroups(data)
	});
	socket.on('leaderboard',function(data)
	{
		updateLeaderBoard(data)
	});
	socket.on('data',function(data)
	{
		processPackets(data)
	});
	socket.on('spawnsuccess',function(data)
	{
		completeSpawn(data)
	});
	//older stuff
	//gameBoard = new GameController();
	graphics = new ViewPort(0,0,window.innerWidth,window.innerHeight);
	player = new PlayerController(undefined);
	leaderBoard = new LeaderBoard();
}

///hash map code
function GameMap() 
{
	this.size = MAP_SIZE/HASH_SIZE;
	this.allObjects = []; //contains all objects on the map
	this.map = new Array(this.size); //create first dimension
	for (let x = 0; x < this.size; x++) 
	{
		this.map[x] = new Array(this.size); //create second dimension
		for (let y = 0; y < this.size; y++)
		{
			this.map[x][y] = []; //creates a blank array to hold objects at this node
		}
	}
}
//adds an object at this location
GameMap.prototype.addObject = function(object) 
{
	this.allObjects.push(object);
	let x = Math.floor(object.pos.x/HASH_SIZE);
	let y = Math.floor(object.pos.y/HASH_SIZE);
	this.map[x][y].push(object);
}
//range-checking
GameMap.prototype.checkAllInRange = function(pos,range) 
{
	let radius = Math.ceil(range/HASH_SIZE);
	let x = Math.floor(pos.x/HASH_SIZE);
	let y = Math.floor(pos.y/HASH_SIZE);
	let output = [];
	let checkedNodes = 0;
	let validNodes = 0;
	for (let dx = -radius; dx <= radius; dx++) 
	{
		if (x+dx >= 0 && x+dx < this.size)
		for (let dy = -radius; dy <= radius; dy++)
		{
			if (y+dy >= 0 && y+dy < this.size)
			{
			for (let obj in this.map[x+dx][y+dy])
			{
				let pos2 = this.map[x+dx][y+dy][obj];
				checkedNodes++;
				if (Position.getDistance(pos,pos2.pos) <= range)
				{
					validNodes++;
					output.push(pos2);
				}
			}
			}
		}
	}
	return output;
}
//draws the grid
GameMap.prototype.drawGrid = function() 
{
	draw.strokeStyle = "rgb(200,200,200)";
	draw.lineWidth = 2;
	for (let x = 0; x < this.size; x++)
	{
		for (let y = 0; y < this.size; y++)
		{
			draw.strokeRect(x*HASH_SIZE-graphics.x,y*HASH_SIZE-graphics.y,HASH_SIZE,HASH_SIZE);
		}
	}
}

//class for nodes
function Node(position,level) 
{
	this.id = 0; //node ID
	this.pos = position; //position of the node
	this.level = level; //level of the node, influences capture speed and unit production
	this.size = (20+10*level)*SIZE_SCALE; //size of the node is based on level
	this.team = 0; //nodes are created neutral by default
	this.units = []; //a listing of all unit groups that are on this node
	this.selected = false; //whether the user has selected this node
	//this.fighting = false; //whether or not the node is fighting
	//this.capturing = false; //whether or not the node is being captured
	//this.spawning = false; //whether or not the node is spawning units
	this.capturePoints = 0; //percentage of base that was captured
	this.captureTeam = undefined; //the team that is capturing the node (undefined if no team is capturing)
}
//draws the node
Node.prototype.drawObject = function(viewport) 
{
	//draw the main node
	if (teams[this.team] == undefined) {console.log("Invalid Node Team");return;}//error handling for missing team
	this.drawBody(viewport)
	//show player name above the node
	if (this.team != 0)
	{
		let name = teams[this.team].name;
		draw.fillStyle = teams[this.team].color;
		draw.fillText(name,this.pos.x-viewport.x,this.pos.y-viewport.y-this.size*2)
	}
	//draw all units in orbit around the center of the node, and draw numbers to show the amounts
	let numAngle = 0;
	for (let index = 0; index < this.units.length; index++)
	{
		let group = this.units[index];
		group.updateUnitMap();
		draw.fillStyle = teams[group.team].color;
		for (let index = 0; index < group.unitMap.length; index += 1) 
		{
			let unitPos = group.unitMap[index];
			let unitx = this.pos.x-viewport.x+(Math.cos(unitPos.angle)*this.size*unitPos.distance);
			let unity = this.pos.y-viewport.y+(Math.sin(unitPos.angle)*this.size*unitPos.distance);
			//draw.fillRect(unitx-2,unity-2,4,4); made smaller due to scale change
			draw.fillRect(unitx-1,unity-1,2,2);
		}
		let textDistance = this.size*2+group.number.toString().length*4;
		draw.fillText(group.number,
		this.pos.x-viewport.x+(textDistance*Math.cos(numAngle)),
		this.pos.y-viewport.y+(textDistance*Math.sin(numAngle)+4)
		);
		numAngle += (2*Math.PI)/this.units.length;
	}

	//if the node is selected, draw a circle around it
	if (this.selected)
	{
		draw.strokeStyle = "rgba(128,128,128,.5)";
		draw.lineWidth = 3;
		draw.beginPath();
		draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size*1.5,0,2*Math.PI,false);
		draw.stroke();
	}
	//if the node is being captured, draw the capture meter
	if (this.capturePoints != 0) 
	{
		if (this.team != 0) draw.strokeStyle = teams[0].color;
		else if (teams[this.captureTeam] == undefined) {console.log("Invalid Capture Team");return;}//error handling for missing team
		else draw.strokeStyle = teams[this.captureTeam].color;
		draw.lineWidth = 4;
		draw.beginPath();
		draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size,0,(2*Math.PI)*(this.capturePoints/100));
		draw.stroke();
	}
}
//draw function for standard node  body (special nodes overwrite this)
Node.prototype.drawBody = function(viewport)
{
	draw.fillStyle = teams[this.team].color;
	draw.beginPath();
	draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size,0,2*Math.PI,false);
	draw.fill();
}
//returns the amount of units of the given team on this node
Node.prototype.getUnitsOfTeam = function(team)
{
	for (let index in this.units) 
	{
		let group = this.units[index];
		if (group.team == team)
			return group.number;
	}
	//if no group is found, return 0
	return 0;
}
//sums the total amount of units on this node
Node.prototype.getTotalUnits = function() 
{
	let sum = 0;
	for (let index in this.units) 
	{
		sum += this.units[index].number;
	}
return sum;	
}
//adds (or removes if parameter is negative) units to the node
Node.prototype.addUnits = function(team,number,effect) 
{
	if (teams[team] == undefined) {console.log("Attempting to add units to invalid team");return;}
	let isAdded = false;
	for (let index in this.units) 
	{
		let group = this.units[index];
		if (group.team == team) 
		{
			if (effect == true && number < 0) //generate effects
			{
				for (let index = 0; index < -number; index += 1) 
				{
					let unitPos = group.unitMap[index];
					if (unitPos == undefined) //abort if unitPos is invalid
						break;
					let unitx = this.pos.x+(Math.cos(unitPos.angle)*this.size*unitPos.distance);
					let unity = this.pos.y+(Math.sin(unitPos.angle)*this.size*unitPos.distance);
					graphics.addExplosionEffect(new Position(unitx,unity),teams[group.team].color)
				}
			}
			group.number += number;
			if (group.number <= 0) 
			{
				this.units.splice(index,1);
				if (this.team != group.team) teams[team].controller.removeOccupiedNode(this);//delete an index with no units
			}
			isAdded = true;
		}
	}
	if (isAdded == false && number != 0) 
	{
		this.units.push(new Units(team,number));
		teams[team].controller.addOccupiedNode(this);
	}
}
//special node type: factory, high production unless fighting
FactoryNode.prototype = new Node();
FactoryNode.prototype.constructor = FactoryNode;
function FactoryNode(position)
{
	Node.call(this,position,10);
	this.size = 125*SIZE_SCALE;
	this.nodeType = "factory";
}
//draws a hexagon
FactoryNode.prototype.drawBody = function(viewport)
{
	draw.fillStyle = teams[this.team].color;
	draw.beginPath();
	//draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size,0,2*Math.PI,false);
	draw.moveTo(this.pos.x-viewport.x+this.size,this.pos.y-viewport.y)
	draw.lineTo(this.pos.x-viewport.x+this.size/2,this.pos.y-viewport.y-this.size*0.866)
	draw.lineTo(this.pos.x-viewport.x-this.size/2,this.pos.y-viewport.y-this.size*0.866)
	draw.lineTo(this.pos.x-viewport.x-this.size,this.pos.y-viewport.y)
	draw.lineTo(this.pos.x-viewport.x-this.size/2,this.pos.y-viewport.y+this.size*0.866)
	draw.lineTo(this.pos.x-viewport.x+this.size/2,this.pos.y-viewport.y+this.size*0.866)
	draw.fill();
}
//special node type: turret, shoots at nearby enemy unit groups
TurretNode.prototype = new Node();
TurretNode.prototype.constructor = TurretNode;
function TurretNode(position)
{
	Node.call(this,position,5);
	this.nodeType = "turret";
}
//draws a square
TurretNode.prototype.drawBody = function(viewport)
{
	draw.fillStyle = teams[this.team].color;
	draw.fillRect(this.pos.x-viewport.x-this.size*.75,this.pos.y-viewport.y-this.size*.75,this.size*1.5,this.size*1.5);
	//show the laser's range
	if (this.team != 0)
		this.drawRange(viewport)
}
//shows a turret's range
TurretNode.prototype.drawRange = function(viewport)
{
	draw.strokeStyle = teams[this.team].color;
	draw.lineWidth = 2;
	draw.globalAlpha = 0.3;
	draw.beginPath();
	draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,TURRET_RANGE,0,2*Math.PI);
	draw.stroke();
	draw.globalAlpha = 1;}
//special node type: portal, teleports units of the controlled team
PortalNode.prototype = new Node();
PortalNode.prototype.constructor = PortalNode;
function PortalNode(position)
{
	Node.call(this,position,5);
	this.nodeType = "portal";
}
//some sort of portal effect
PortalNode.prototype.drawBody = function(viewport)
{
	draw.strokeStyle = teams[this.team].color;
	draw.lineWidth = 4;
	//inner ring
	draw.beginPath();
	draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size*0.5,0,2*Math.PI,false);
	draw.stroke();
	//outer ring
	draw.beginPath();
	draw.arc(this.pos.x-viewport.x,this.pos.y-viewport.y,this.size,0,2*Math.PI,false);
	draw.stroke();
	//connecting lines
	draw.lineWidth = 2;
	draw.beginPath();
	draw.moveTo(this.pos.x-viewport.x+this.size,this.pos.y-viewport.y);
	draw.lineTo(this.pos.x-viewport.x+this.size*0.5,this.pos.y-viewport.y);
	draw.moveTo(this.pos.x-viewport.x-this.size,this.pos.y-viewport.y);
	draw.lineTo(this.pos.x-viewport.x-this.size*0.5,this.pos.y-viewport.y);
	draw.moveTo(this.pos.x-viewport.x,this.pos.y-viewport.y+this.size);
	draw.lineTo(this.pos.x-viewport.x,this.pos.y-viewport.y+this.size*0.5);
	draw.moveTo(this.pos.x-viewport.x,this.pos.y-viewport.y-this.size);
	draw.lineTo(this.pos.x-viewport.x,this.pos.y-viewport.y-this.size*0.5);
	draw.stroke();
}

//an object for a moving group of units
function MovingGroup(team,number,startNode,endNode) 
{
	this.id = 0; //moving group ID
	this.team = team;
	this.number = number;
	this.startNode = startNode;
	this.endNode = endNode;
	this.pos = new Position(startNode.pos.x,startNode.pos.y);
	this.direction = Position.getDirection(this.startNode.pos,this.endNode.pos);
	this.remainingDistance = Position.getDistance(this.startNode.pos,this.endNode.pos);
	this.lastMoveTime = new Date(); //time when the last move order was executed, should be at most 17 without any lag
}
MovingGroup.prototype.drawObject = function(viewport) 
{
	if (teams[this.team] == undefined) 
	{console.log("Invalid Moving Group Team");return;}
	//draws a cloud of units
	draw.fillStyle = teams[this.team].color;
	if (true || graphics.zoomLevel < 2)
	{
		for (let unitindex = 0; unitindex < this.number; unitindex += 1) 
		{
			let angle = Math.random()*2*Math.PI;
			let distance = (20+this.number/10)*(1+Math.random());
			let unitx = this.pos.x-viewport.x+(Math.cos(angle)*distance);
			let unity = this.pos.y-viewport.y+(Math.sin(angle)*distance);					
			//draw.fillRect(unitx-2,unity-2,4,4); made smaller due to scale change
			draw.fillRect(unitx-1,unity-1,2,2);
		}
	}
	draw.fillText(this.number,this.pos.x-viewport.x,this.pos.y-viewport.y);
}
//moves the group towards its destination
MovingGroup.prototype.move = function() 
{
	let currentTime = new Date();
	let distance = MOVE_SPEED*(currentTime-this.lastMoveTime)/1000
	this.lastMoveTime = currentTime
	this.pos.x += distance*Math.cos(this.direction);
	this.pos.y += distance*Math.sin(this.direction);
	this.remainingDistance -= distance;
	//if close to the other node, add this group's units to that node
	if (this.remainingDistance <= this.endNode.size) 
	{
		//this.endNode.addUnits(this.team,this.number);
		//remove this group from array
		for (let n in movingUnits) 
		{
			let checkedGroup = movingUnits[n];
			if (checkedGroup == this)
				movingUnits.splice(n,1);
		}
	}
}
//unit move loop
function moveAllGroups()
{
	for (var u in movingUnits)
		movingUnits[u].move()
}
setInterval(moveAllGroups,1000/60)

//a simple position object, used for certain inherited methods
function Position(x,y)
{
	this.x = x; this.y = y;
}
//returns the distance between two Position objects
Position.getDistance = function(pos1,pos2) 
{
	return Math.sqrt(Math.pow(pos2.x-pos1.x,2)+Math.pow(pos2.y-pos1.y,2));
}
//returns the direction between two Position objects
Position.getDirection = function(pos1,pos2)
{
	let result = Math.atan2(pos2.y-pos1.y,pos2.x-pos1.x);
	if (result == 0)//what is this for?
		console.log("invalid direction");
	return result;
}
//an object for a unit group (may not be needed)
function Units(team,number)
{
	this.team = team;
	this.number = number;
	this.unitMap = []; //a map of the angle and direction of all units for the graphics system to draw
	this.addUnits(this.number);
}
//updates the unit map
Units.prototype.updateUnitMap = function() 
{
	let difference = this.number-this.unitMap.length;
	//if number is larger than unitMap, delete some entries
	if (difference < 0) 
	{
		this.unitMap.splice(0,-difference);
	}
	//if number is larger than unitMap, add some entries
	else 
	{
		this.addUnits(difference);
	}
	//rotate all units
	for (let index in this.unitMap) 
	{
		let unit = this.unitMap[index];
		unit.angle += 1*(Math.PI / 180);
	}
}
Units.prototype.addUnits = function(num) 
{
	for (let x = 0; x < num; x++)
	{
		let angle = Math.random()*2*Math.PI;
		let distance = 1.25+Math.random()*0.5;
		this.unitMap.push({angle:angle,distance:distance});
	}
}

///graphics system
function ViewPort(x,y,width,height)
{
	//note: the width of the canvas according to HTML influences how elements are drawn on it.
	this.x = x;
	this.y = y;
	this.width = width;
	this.height = height;
	this.zoomLevel = 1;
	this.scrollDirections = new Set([])
	this.effects = [];
	this.lastDrawTime = new Date()
	let self = this;
	this.handleResize() //adjust the screen initially
	window.onresize = function(e) {self.handleResize(e);};
	window.onwheel = function(e) {self.zoom(e);};
	requestAnimationFrame(drawMain)
	//setInterval(function(_this){_this.drawAllInside();},17,this);
}
//draws everything inside the viewport (could be optimized)
function drawMain()
{
	//scroll screen
	let newTime = new Date()
	let difference = newTime - graphics.lastDrawTime
	if (graphics.scrollDirections.has("Left"))
		graphics.x -= 0.5*difference*graphics.zoomLevel
	if (graphics.scrollDirections.has("Up"))
		graphics.y -= 0.5*difference*graphics.zoomLevel
	if (graphics.scrollDirections.has("Right"))
		graphics.x += 0.5*difference*graphics.zoomLevel
	if (graphics.scrollDirections.has("Down"))
		graphics.y += 0.5*difference*graphics.zoomLevel
	graphics.lastDrawTime = newTime
	//set font size
	draw.font = "" + (fontSize) + "px" + " sans-serif";
	draw.textAlign = "center"
	//clear screen
	draw.clearRect(0,0,canvas.width,canvas.height);
	//calculate boundaries of viewport (plus a buffer region)
	let vLeft = graphics.x-100
	let vTop = graphics.y-100
	let vRight = graphics.x+graphics.width+100
	let vBottom = graphics.y+graphics.height+100
	//show the player's control range (first to show underneath all other elements)
	draw.fillStyle = "rgb(12,12,12)";
	for (let index in player.occupiedNodes)
	{
		let node = player.occupiedNodes[index];
		if (node.team != player.team) continue;
		draw.beginPath();
		draw.arc(node.pos.x-graphics.x,node.pos.y-graphics.y,CONTROL_RANGE,0,2*Math.PI,false);
		draw.fill();
	}
	//draw the border
	draw.strokeStyle = "rgb(255,255,255)";
	draw.lineWidth = 8;
	draw.strokeRect(0-graphics.x,0-graphics.y,MAP_SIZE,MAP_SIZE);
	//draw moving groups
	for (let index in movingUnits) 
	{
		let group = movingUnits[index];
		//only draw if the object is near the viewport
		if (group.pos.x >= vLeft && group.pos.y >= vTop && group.pos.x <= vRight && group.pos.y <= vBottom)
			group.drawObject(graphics);
	}
	//draw nodes
	for (let index in gameMap.allObjects) 
	{
		let node = gameMap.allObjects[index];
		//only draw if the object is near the viewport
		if (node.pos.x >= vLeft && node.pos.y >= vTop && node.pos.x <= vRight && node.pos.y <= vBottom)
			node.drawObject(graphics);
		else if (node.nodeType == "turret" && node.team != 0) //draw turret ranges if they aren't in view
			node.drawRange(graphics);
	}
	//update the unit indicator
	unitCounter.innerHTML = "POP:" + player.getTotalUnits() + "/" + player.unitCapacity
	//draw a box for box select
	if (player.boxSelectPoint != undefined)
	{
		draw.strokeStyle = "rgba(255,255,255,0.5)";
		draw.lineWidth = 4;
		draw.strokeRect(player.boxSelectPoint.x-graphics.x,player.boxSelectPoint.y-graphics.y,
			player.mousePos.x-player.boxSelectPoint.x,player.mousePos.y-player.boxSelectPoint.y)
	}
	//draw effects
	for (let e in graphics.effects)
	{
		let effect = graphics.effects[e];
		let maxAge;
		if (e < 250) //do not draw more than 250 effects
		{
			switch(effect.type)
			{	
				case "explosion":
				draw.globalAlpha = 0.6-effect.age*0.1
				draw.fillStyle = effect.color || "rgb(255,255,255)";
				draw.beginPath();
				draw.arc(effect.pos.x-graphics.x,effect.pos.y-graphics.y,4+effect.age,0,2*Math.PI,false);
				draw.fill();
				maxAge = 6;
				break;
				case "laser":
				draw.globalAlpha = 0.75-effect.age*0.25
				draw.strokeStyle = effect.color || "rgb(255,255,255)"
				draw.beginPath();
				draw.moveTo(effect.pos1.x-graphics.x,effect.pos1.y-graphics.y);
				draw.lineTo(effect.pos2.x-graphics.x,effect.pos2.y-graphics.y);
				draw.stroke();
				maxAge = 2;
				break;
			}
		}
		effect.age++;
		if (effect.age >= maxAge)
		{
			graphics.effects.splice(e,1);
			e--;
		}
	}
	draw.globalAlpha = 1
	//repeat when next animation frame is requested
	requestAnimationFrame(drawMain)
}
//changes the viewport when the screen changes
ViewPort.prototype.handleResize = function(e) 
{
	this.x -= (window.innerWidth*this.zoomLevel - this.width)/2;
	this.y -= (window.innerHeight*this.zoomLevel - this.height)/2;
	canvas.width = window.innerWidth*this.zoomLevel;
	canvas.height = window.innerHeight*this.zoomLevel;
	this.width = window.innerWidth*this.zoomLevel;
	this.height = window.innerHeight*this.zoomLevel;
}
//zooms the screen in and out
ViewPort.prototype.zoom = function(e) 
{
	let scrollAmount = e.wheelDelta/-120;
	this.zoomLevel += scrollAmount*0.05;
	//put limits on zoom level
	if (this.zoomLevel > 3) this.zoomLevel = 3;
	if (this.zoomLevel < 1) this.zoomLevel = 1;
	fontSize = 16+16*((this.zoomLevel-1)/2);
	this.handleResize(e); //resizes the screen automatically
}
//adds an explosion effect
ViewPort.prototype.addExplosionEffect = function(position,color)
{
	this.effects.push({type:"explosion",pos:position,color:color,age:0})
}
//adds a laser effect
ViewPort.prototype.addLaserEffect = function(pos1,pos2,color)
{
	this.effects.push({type:"laser",pos1:pos1,pos2:pos2,color:color,age:0})
}

///leaderboard mechanic
function LeaderBoard() 
{
	this.top10 = [];
	//setTimeout(function(_this){_this.getLeaders();},1000,this);
}
//get the leaders
LeaderBoard.prototype.getLeaders = function() 
{
	console.log("Updating Leaderboard")
	let allTeams = teams.slice(1);
	allTeams.sort(function (a,b) //sort by unit capacity (develop a scoring system later?)
	{
		return a.controller.unitCapacity-b.controller.unitCapacity;
	});
	this.top10 = allTeams.slice(0,10);
	this.updateBoard();
	setTimeout(function(_this){_this.getLeaders();},1000,this); //automatically recalculate leaders every 5 seconds
}
//update the leaderboard
LeaderBoard.prototype.updateBoard = function() 
{
	for (let index = 1; index <= 10; index++)
	{
		let element = document.getElementById(index); let team = this.top10[index-1];
		if (team !== undefined)
		{
			//console.log(team.controller.unitCapacity)
			element.style.visibility = "visible";
			element.innerHTML = team.name;
			element.style.color = team.color;
		}
		else
		{
			element.style.visibility = "hidden"; //hide excess leaderboard elements
		}
	}
}

///object for a team
function Team(color,controller,name) 
{
	this.color = color;
	this.controller = controller;
	this.name = name || "An Unnamed Team";
}
///main controller class, inherited by subclasses
function Controller(team) 
{
	this.occupiedNodes = []; //list of all nodes with this team's units on them
	this.team = team; //ID of this controller's team
	this.unitCapacity = 0; //this team's unit capacity
}
//creates a moving group between the target node and the other node
Controller.prototype.moveUnits = function(startNode,endNode,unitsTransferred)
{
	if (unitsTransferred != 0 && Position.getDistance(startNode.pos,endNode.pos) <= 1000 && startNode != endNode) //extra checking of conditions
	{
		startNode.addUnits(this.team,-unitsTransferred);
		let moveGroup = new MovingGroup(this.team,unitsTransferred,startNode,endNode);
		movingUnits.push(moveGroup);
		return moveGroup;
	}
}
//adds a controlled node
Controller.prototype.addOccupiedNode = function(node) 
{
	//check for duplicates
	let isDuplicate = false;
	for (var n in this.occupiedNodes) 
	{
		if (this.occupiedNodes[n] == node)
		{
			isDuplicate = true;
		}
	}
	if (!isDuplicate)
	{
		this.occupiedNodes.push(node);
	}
	this.calculateUnitCapacity();
}
//removes a controlled node
Controller.prototype.removeOccupiedNode = function(node) 
{
	for (var n in this.occupiedNodes) 
	{
		if (this.occupiedNodes[n] == node) 
		{
			this.occupiedNodes.splice(n,1);
			if (this.occupiedNodes.length == 0) //if the controller has no nodes, it is eliminated
			{
				console.log("A player is eliminated")
			}
			break;
		}
	}
	this.calculateUnitCapacity();
}
//calculates unit capacity
Controller.prototype.calculateUnitCapacity = function() 
{
	this.unitCapacity = 10*UNITS_PER_LEVEL; //start at base capacity
	for (let n in this.occupiedNodes) //add capacity for each owned node
	{
		let node = this.occupiedNodes[n];
		if (this.getOwner(node) == 1 && node.nodeType == undefined)
			this.unitCapacity += node.level*UNITS_PER_LEVEL;
	}
	return this.unitCapacity;
}
//sums up all units in all nodes (should be using selectedNodes)
Controller.prototype.getTotalUnits = function() 
{
	let totalUnits = 0;
	for (let n in this.occupiedNodes) 
	{
		totalUnits += this.occupiedNodes[n].getUnitsOfTeam(this.team);
	}
	for (let n in movingUnits) 
	{
		if (movingUnits[n].team == this.team)
			totalUnits += movingUnits[n].number;
	}
	return totalUnits;
}
//returns true if total units is greater than unit capacity, otherwise false
Controller.prototype.isCapacityReached = function() 
{
	return (this.getTotalUnits() >= this.unitCapacity);
}
//a method for determining whether something is part of this team
Controller.prototype.getOwner = function(node) 
{
	if (node.team == this.team)
		return 1;
	if (node.team == 0)
		return 0;
	else return -1;
}

///controller object for a team, player user input system
PlayerController.prototype = new Controller();
PlayerController.prototype.constructor = PlayerController;
function PlayerController(team) 
{
	Controller.call(this,team);
	this.selectedNodes = []; //nodes the player has currently selected
	this.lastMoved = []; this.lastTarget = undefined; //nodes involved in the last move order (for double-clicks)
	this.selecting = false; //whether or not to select nodes the mouse hovers over
	this.dragMode = false; //whether the user has clicked on empty space
	this.pixelsMoved = 0; //amount of pixels the camera has been moved
	this.boxSelectPoint = undefined; //the point that box select started on, or undefined if box select is inactive
	this.mousePos; //the current mouse position
	//graphics.scrollDirections = new Set([]) //keys currently pressed
	this.unitPercentage = 50; //percentage of units sent on move orders
	//add control handlers
	let self = this;
	window.onkeydown = function(e) {self.getKeyboardInput(e);};
	window.onkeyup = function(e) {self.getKeyUp(e);};
	canvas.onmousedown = function(e) {self.getMouseDown(e);};
	canvas.onmousemove = function(e) {self.getMouseMove(e);};
	canvas.onmouseup = function(e) {self.getMouseUp(e);};
	canvas.ondblclick = function(e) {self.getDoubleClick(e);};
	canvas.onmouseout = function(e) {self.selecting = false; self.dragMode = false;}; //resets modes if mouse exits game
	unitSlider.oninput = function(e) {self.changeUnitPercentage();};
}
//spawns in the player
PlayerController.prototype.spawn = function(e) 
{
	//pushes out a new color for the player
	this.team = teams.length;
	sendSpawnPlayer(document.getElementById("nameBox").value)
}
//adds a selected node, avoiding duplicates
PlayerController.prototype.addSelectedNode = function(node) 
{
	let isDuplicate = false;
	for (let index in this.selectedNodes) 
	{
		if (node == this.selectedNodes[index])
			isDuplicate = true;
	}
	if (!isDuplicate)
	{
		node.selected = true;
		this.selectedNodes.push(node);
	}
} 
//reads keyboard input
PlayerController.prototype.getKeyboardInput = function(e) 
{
	switch (e.keyCode) 
	{
		case 37: case 65: //left arrow or A
		graphics.scrollDirections.add("Left")
		break;
		case 38: case 87: //up arrow or W
		graphics.scrollDirections.add("Up")
		break;
		case 39: case 68: //right arrow or D
		graphics.scrollDirections.add("Right")
		break;
		case 40: case 83: //down arrow or S
		graphics.scrollDirections.add("Down")
		break;
		case 81: //Q
		unitSlider.value -= 10;
		this.changeUnitPercentage();
		break;
		case 69: //E
		unitSlider.value -= -10; //strange format to prevent string concactenation
		this.changeUnitPercentage();
		break;
		case 32: //space, activates box selection
		if (this.team !== undefined) 
		{
			if (this.boxSelectPoint == undefined)
				this.boxSelectPoint = this.mousePos
			/*
			for (var n in this.occupiedNodes) 
			{
				let node = this.occupiedNodes[n];
				this.selectedNodes.push(node);
				node.selected = true;
			}
			*/
		}
		break;
		case 27: //escape, clears selected nodes
		for (let n in this.selectedNodes)
			this.selectedNodes[n].selected = false;
		this.selectedNodes = [];
		break;
		default:
		//console.log("Unidentified Key " + e.keyCode)
		break;
	}
}
PlayerController.prototype.getKeyUp = function(e)
{
	switch (e.keyCode)
	{		
		case 37: case 65: //left arrow or A
		graphics.scrollDirections.delete("Left")
		break;
		case 38: case 87: //up arrow or W
		graphics.scrollDirections.delete("Up")
		break;
		case 39: case 68: //right arrow or D
		graphics.scrollDirections.delete("Right")
		break;
		case 40: case 83: //down arrow or S
		graphics.scrollDirections.delete("Down")
		break;
		case 32: //space, finish box select
		if (this.boxSelectPoint != undefined)
		{
			//get upper left and lower right corners
			let x1 = Math.min(this.boxSelectPoint.x,this.mousePos.x)
			let y1 = Math.min(this.boxSelectPoint.y,this.mousePos.y)
			let x2 = Math.max(this.boxSelectPoint.x,this.mousePos.x)
			let y2 = Math.max(this.boxSelectPoint.y,this.mousePos.y)
			let point1 = new Position(x1,y1)
			let point2 = new Position(x2,y2)
			//check each occupied node to see if it is within the box
			for (let n in this.occupiedNodes)
			{
				let node = this.occupiedNodes[n]
				if (node.pos.x > point1.x && node.pos.x < point2.x && node.pos.y > point1.y && node.pos.y < point2.y)
				{
					this.addSelectedNode(node)
				}
			}
		}
		this.boxSelectPoint = undefined;
		break;
	}
}
PlayerController.prototype.getMouseDown = function(e) 
{
	e.preventDefault();
	this.mousePos = new Position((e.clientX*graphics.zoomLevel)+graphics.x, (e.clientY*graphics.zoomLevel)+graphics.y);
	if (this.team !== undefined)
	{
		//detect the node that is clicked on
		let node = this.detectSelectedNode()
		//if selectedNodes has no nodes in it, select the clicked node
		if (node !=  undefined) 
		{
			this.selecting = true;
			this.addSelectedNode(node);
		}
		else //initiate click-drag mode 
		{
			this.dragMode = true;
		}
	}
	else //if in spectator, enable dragging
	{
		this.dragMode = true;
	}
}
PlayerController.prototype.getMouseMove = function(e) 
{
	let nextPos = new Position((e.clientX*graphics.zoomLevel)+graphics.x, (e.clientY*graphics.zoomLevel)+graphics.y);
	if (this.team !== undefined && this.selecting)
	{
		//detect the node that the mouse is over
		let node = this.detectSelectedNode()
		//select the clicked node
		if (node != undefined) 
		{
			this.addSelectedNode(node);
		}
	}
	else 
	{
		if (this.dragMode) //drag the screen
		{
			let dx = this.mousePos.x-nextPos.x;
			let dy = this.mousePos.y-nextPos.y;
			graphics.x += dx;
			graphics.y += dy;
			nextPos.x += dx; nextPos.y += dy;
			this.pixelsMoved += Math.abs(dx+dy)/graphics.zoomLevel
		}
	}
	this.mousePos = nextPos;
}
//reads mouse input
PlayerController.prototype.getMouseUp = function(e) 
{
	e.stopPropagation();
	//get mouse position relative to the viewport's position(?)
	this.mousePos = new Position((e.clientX*graphics.zoomLevel)+graphics.x,(e.clientY*graphics.zoomLevel)+graphics.y);
	//controls do not operate if players has not spawned in
	if (this.team !== undefined && this.selecting)
	{
		this.selecting = false;
		//detect the node that is clicked on
		let node = this.detectSelectedNode()
		//if a node is selected, move units between both nodes
		if (node != undefined && (node != this.selectedNodes[0] || this.selectedNodes.length > 1))
		{
			this.lastTarget = node;
			for (let x in this.selectedNodes) 
			{
				let otherNode = this.selectedNodes[x];
				otherNode.selected = false;
				let unitsTransferred = Math.floor(otherNode.getUnitsOfTeam(this.team)*(this.unitPercentage/100));
				if (node != undefined && node != otherNode)
				{
					//console.log("Moving Units")
					this.lastMoved.push(otherNode)
					socket.emit("move",{startNode:otherNode.id,endNode:node.id,unitsTransferred:unitsTransferred})
				}
			}
			//initialize double click detection
			setTimeout(function(_this){_this.lastMoved = [];_this.lastTarget = undefined;},500,this);
			//clear all selected nodes
			this.selectedNodes = [];
		}
	}
	else 
	{
		if (this.pixelsMoved <= 10) //deselect if the user clicked on empty space without dragging a significant distance
		{
			for (let n in this.selectedNodes)
				this.selectedNodes[n].selected = false;
			this.selectedNodes = [];
		}
		this.dragMode = false;
		this.pixelsMoved = 0;
	}
}
//gets a double click
PlayerController.prototype.getDoubleClick = function(e) 
{
	//console.log("Doubleclick detected")
	for (let n in this.lastMoved)
	{
		let node = this.lastMoved[n]
		let unitsTransferred = node.getUnitsOfTeam(this.team)
		socket.emit("move",{startNode:node.id,endNode:this.lastTarget.id,unitsTransferred:unitsTransferred})
	}			
	//deselect nodes
	for (let n in this.selectedNodes)
		this.selectedNodes[n].selected = false;
	this.selectedNodes = [];
}
//updates the unit percentage
PlayerController.prototype.changeUnitPercentage = function()
{
	let value = unitSlider.value;
	this.unitPercentage = value;
	unitValue.innerHTML = value + "%" //update the unit value text
}
//detects the node the player is clicking on
PlayerController.prototype.detectSelectedNode = function()
{
	let potentialSelections = gameMap.checkAllInRange(this.mousePos,250);
	for (let n in potentialSelections) 
	{
		if (Position.getDistance(this.mousePos,potentialSelections[n].pos) <= potentialSelections[n].size+40)
			return potentialSelections[n];
	}
	return undefined;
}

//returns the object with the given ID, or undefined if none is present
function getObjectById(id) 
{
	for (let n in gameMap.allObjects)
	{
		let object = gameMap.allObjects[n]
		if (id == object.id)
			return object;
	}
	return undefined
}

//netcode elements
function updateTeams(data)
{
	for (let n in data)
	{
		let entry = data[n]
		//test to ensure the teams are not duplicated
		if (teams[entry.index] == undefined)
		{
			let entry = data[n]
			let newTeam = new Team(entry.color,new Controller(),entry.name)
			teams[entry.index] = newTeam
		}
	}
	if (player.team != undefined && player.team != 0)
		teams[player.team].controller = player
}
function updateGameMap(data)
{
	for (let n in data) 
	{
		let entry = data[n];
		//test to see if a duplicate is detected
		let duplicate = undefined
		for (let n in gameMap.allObjects)
		{
			if (entry.id == gameMap.allObjects[n].id)
				duplicate = gameMap.allObjects[n]
		}
		if (duplicate == undefined) //adding new node
		{
			//console.log("New Node Detected")
			let tempNode;// = new Node(entry.pos,entry.level);
			switch (entry.nodeType)
			{
				case "factory":
				tempNode = new FactoryNode(entry.pos)
				break;
				case "turret":
				tempNode = new TurretNode(entry.pos)
				break;
				case "portal":
				tempNode = new PortalNode(entry.pos)
				break;
				default:
				tempNode = new Node(entry.pos,entry.level);
				break;
			}
			for (let u in entry.units)
			{
				let group = entry.units[u];
				tempNode.addUnits(group.team,group.number)
			}
			tempNode.id = entry.id
			tempNode.team = entry.team
			teams[entry.team].controller.addOccupiedNode(tempNode)
			tempNode.capturePoints = entry.capturePoints
			tempNode.captureTeam = entry.captureTeam
			gameMap.addObject(tempNode)
		}
		else //updating attributes of existing node
		{
			for (let u in entry.units) //update each unit group
			{
				/*
				let newUnits = entry.units[u].number
				let oldUnits = duplicate.getUnitsOfTeam(newUnits.team)
				let difference = newUnits-oldUnits
				duplicate.addUnits(newUnits.team,difference)
				*/
			}
			for (let n in duplicate.units) //check for groups that have been eliminated
			{
				let isPresent = false
				for (let u in entry.units)
				{
					isPresent = isPresent || duplicate.units[n].team == entry.units[u].team
				}
				if (!isPresent)
				{
					duplicate.addUnits(duplicate.units[n].team,-100)
				}
			}
			duplicate.team = entry.team
			duplicate.capturePoints = entry.capturePoints
			duplicate.captureTeam = entry.captureTeam
			//tempNode.selected = gameMap.allObjects[n].selected
			//gameMap.allObjects[n] = tempNode
		}
			
	}
}
function updateMovingGroups(data)
{
	for (let n in data)
	{
		let entry = data[n]
		let newGroup = new MovingGroup(entry.team,entry.number,entry.startNode,entry.endNode)
		newGroup.id = entry.id
		//add the moving group if it is not on the field
		let duplicateDetected = false
		for (let u in movingUnits)
		{
			duplicateDetected = duplicateDetected || newGroup.id == movingUnits[u].id
		}
		if (!duplicateDetected)
			movingUnits.push(newGroup)
	}
}
function updateLeaderBoard(data)
{
	leaderBoard.top10 = []
	for (let n in data)
	{
		leaderBoard.top10.push(data[n])
	}
	leaderBoard.updateBoard()
}
//process game information packets
function processPackets(data)
{
	for (let n in data)
	{
		let entry = data[n]			
		let node = getObjectById(entry.node)
		switch (entry.type)
		{
			case "units": //units are added or removed from the node
			node.addUnits(entry.team,entry.number,entry.effect)
			break;
			case "assault": //the node is being captured
			if (entry.points < 0)
				console.log("Negative capture points?")
			node.capturePoints = Math.max(entry.points,0)
			node.captureTeam = entry.team
			break;
			case "capture": //the node has changed teams
			teams[node.team].controller.removeOccupiedNode(node)
			node.team = entry.team
			teams[node.team].controller.addOccupiedNode(node)
			break;
			case "move": //a moving group is being generated
			let newGroup = new MovingGroup(entry.team,entry.number,node,getObjectById(entry.otherNode))
			newGroup.id = entry.id
			movingUnits.push(newGroup)
			break;
			case "groupLoss": //a moving group has lost units due to attrition or turrets
			let group; let u;
			for (u in movingUnits)
			{
				if (movingUnits[u].id == entry.id)
				{
					group = movingUnits[u];
					break;
				}
			}
			if (group != undefined)
			{
				group.number -= entry.number
				if (entry.laser != undefined) //add visual effects if a turret caused the group losses
				{
					let turret = getObjectById(entry.laser)
					graphics.addLaserEffect(turret.pos,group.pos,teams[turret.team].color)
				}
				if (group.number <= 0) //delete the moving group if it is reduced to 0 units
					movingUnits.splice(u,1)
			}
			break;
			case "addTeam": //a new team has spawned in
			console.log("Adding Team")
			if (entry.index == player.team)
				teams[entry.index] = new Team(entry.color,player,entry.name);
			else
				teams[entry.index] = new Team(entry.color,new Controller(),entry.name);
			break;
			case "removeTeam": //a team has been eliminated
			console.log("Removing Team")
			setTimeout(function() {delete teams[entry.index];},1000) //remove after a delay to prevent errors
			break;
			case "teleport": //draw the teleport effect
			for (let n = 1; n <= entry.number;n++)
			{
				let angle = Math.random()*2*Math.PI;
				let distance = Math.random()*20;
				let startPos = new Position(node.pos.x + distance*Math.cos(angle),node.pos.y + distance*Math.sin(angle))
				let targetNode = getObjectById(entry.otherNode)
				angle = Math.random()*2*Math.PI; //same angle on both start and end points?
				distance = targetNode.size*(1.25+Math.random()*0.5)
				let endPos = new Position(targetNode.pos.x+distance*Math.cos(angle),targetNode.pos.y+distance*Math.sin(angle))
				graphics.addLaserEffect(startPos,endPos,teams[node.team].color)
			}
			break;
		}
	}
}
function sendSpawnPlayer(name)
{
	socket.emit("spawn",name)
}
function completeSpawn(data)
{
	console.log("Completing Spawn Process")
	player.team = data.team
	if (teams[player.team] != undefined) //switch the controller in the teams 
	{
		player.occupiedNodes = teams[player.team].controller.occupiedNodes
		teams[player.team].controller = player
		player.calculateUnitCapacity()
	}
	graphics.x = data.spawnPoint.pos.x-(graphics.width/2);
	graphics.y = data.spawnPoint.pos.y-(graphics.height/2);
	//reset data for the spawn point
	//let spawnNode = getObjectById(data.spawnPoint.id)
	//spawnNode.capturePoints = 0; spawnNode.captureTeam = 0; spawnNode.units = [];
}
function handleDisconnect(data)
{
	document.getElementById("title").style.visibility = "visible";
	document.getElementById("disconnected").style.display = "inline";
	document.getElementById("howToPlay").style.visibility = "hidden";
}