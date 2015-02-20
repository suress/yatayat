// For node API
var _ = _ || require("underscore");
var $ = $ || require("jquery");
var kdTree = kdTree || require('./lib/kdTree-min.js').kdTree;

var YY = YY || {};

//takes routes and create array of routes as routes and routes in object form as routeDict
YY.System = function(routes, stopToSegDict) {
    this.routes = routes;
    var routeDict = {};
    _.each(this.routes, function(r) {
        routeDict[r.id] = r;
    });
    this.routeDict = routeDict;
    this.stopToSegDict = stopToSegDict;

    // insert a routeDict within each stop
    (function(self) {
        _.each(self.routes, function(route) {
            _.each(route.stops, function(stop) {
                stop.routeDict = {};
                self.routes
                    .filter(function(r) {
                        return (r.stopDict[stop.id]);
                    })
                    .forEach(function(r) {
                        stop.routeDict[r.id] = r;
                    });
            });
        });
    })(this);
};

//takes routes and return stopIds for stops in route
YY.System.prototype.allStops = function() {
    var idToStop = {};
    this.routes.forEach(function(r) {
        r.stops.forEach(function(s) {
            idToStop[s.id] = s;
        });
    });
    return _.values(idToStop);
};
//take stopID and return the route with routeID and stopID
YY.System.prototype.stopRoutesFromStopID = function(stopID) {
    return _(this.routes).chain()
        .map(function(r) {
            if (r.stopDict[stopID]) return {
                stopID: stopID,
                routeID: r.id
            };
        })
        .compact()
        .value();
};
//take stopName and return array of stopID and routeID which contains the passed stopName
//2
YY.System.prototype.stopRoutesFromStopName = function(stopName) {
    var aggregator = [];
    // console.log(" qptibo ojsbvmb mpwft up dpef stopRoutesFromStopName");
    _(this.routes).each(function(r) {
        // console.log(r);
        _(r.stops).each(function(s) {
            if (s.name === stopName) {
                aggregator.push({
                    stopID: s.id,
                    routeID: r.id
                });
            }
        });
    });
    return aggregator;

};

// returns a new system with only passed in items included; if includeIDList is falsy, return a copy
YY.System.prototype.prune = function(includeIDList) {
    if (!includeIDList) return this;
    return new YY.System(this.routes.map(function(route) {
        if (route.id in includeIDList) return route;
        else return new YY.Route(route.id,
            route.stops.filter(function(s) {
                return s.id in includeIDList;
            }),
            route.segments.filter(function(s) {
                return s.id in includeIDList;
            }),
            route.tag,
            undefined); //Please don't order this route; this is not a valid startSegID
    }));
};

YY.System.prototype.nearestStops = function(llArr, N, maxDist) {
    // TODO: Return all stops where dist < 2 * dist(nearestStop)
    if (YY._kdt === undefined) {
        var allStops = this.allStops();
        var distFn = function(s1, s2) {
            return Math.pow(s1.lat - s2.lat, 2) + Math.pow(s1.lng - s2.lng, 2);
        };
        YY._kdt = new kdTree(allStops, distFn, ["lat", "lng"]);
    }
    var kdt = YY._kdt;
    var thresh = maxDist || 1; // really far for lat/lng
    var N = N || 1;
    var answer = kdt.nearest({
        lat: llArr[0],
        lng: llArr[1]
    }, N, thresh);
    return _.map(answer, function(a) {
        return a[0];
    });
};
//take startStopName and endStopName , then get array of stopID and routeID for the route and pass to takeMeThereByStop
//1
YY.System.prototype.takeMeThereByName = function(startStopName, goalStopName) {
    // console.log("For"+startStopName+"stop");
    var startNodes = this.stopRoutesFromStopName(startStopName); //2
    // console.log("For"+startStopName+"stop");
    var goalNodes = this.stopRoutesFromStopName(goalStopName);
    if (_.isEmpty(startNodes) || _.isEmpty(goalNodes)) return 'FAIL: Start / Goal not found';
    // TODO: throw error if goal nodes are far away from each other
    return this.takeMeThereByStop(startNodes, goalNodes[0]); //3
}
//take startStopID and endStopID
YY.System.prototype.takeMeThere = function(startStopID, goalStopID) {

    var startNodes = this.stopRoutesFromStopID(startStopID);
    var goalNodes = this.stopRoutesFromStopID(goalStopID);
    return this.takeMeThereByStop(startNodes, goalNodes[0]);
}
// debugger;

// Return [route] where route contains [stops], and just the stops we use
// Else return undefined
//sures--in form of routes
//3
YY.System.prototype.takeMeThereByStop = function(startNodes, goalNode) {
    var system = this;
    var openset = {};
    var closedset = {};
    var gScores = {};
    var fScores = {};
    var cameFrom = {};
    var heuristic = function(stopRouteObj) {
        var stop = system.routeDict[stopRouteObj.routeID].stopDict[stopRouteObj.stopID];
        var goalStop = system.routeDict[goalNode.routeID].stopDict[goalNode.stopID];
        var retval = (goalStop.lat - stop.lat) * (goalStop.lat - stop.lat) +
            (goalStop.lng - stop.lng) * (goalStop.lng - stop.lng);
        // var R=6370;
        // var retval = Math.acos(Math.sin(stop.lat*Math.PI/180)*Math.sin(goalStop.lat*Math.PI/180) + Math.cos(stop.lat*Math.PI/180)*Math.cos(goalStop.lat*Math.PI/180) * Math.cos(goalStop.lng*Math.PI/180-stop.lng*Math.PI/180)) * R;
        return retval;
    };
    var set = function(dict, stopRouteObj, val) {
        dict[stopRouteObj.stopID + "," + stopRouteObj.routeID] = val; //using routeid and stopid as composite key
    };
    var get = function(dict, stopRouteObj) {
        return dict[stopRouteObj.stopID + "," + stopRouteObj.routeID];
    };

    /**
     * After expanding the goal node, i.e. After geting to the goal, Now join each nodes in route in reverse order to form the route
     * @param  {stopRouteObj} currentNode [a stop in route object with stop id and route id]
     * @return {list of stopRouteObj}             [The calculated path]
     */
    var reconstructPath = function(currentNode) {
        var cameFromNode = get(cameFrom, currentNode);
        if (cameFromNode) {
            var p = reconstructPath(cameFromNode);
            return _.union(p, [currentNode]);
        } else {
            return [currentNode];
        }
    };
    var stopNameFromObj = function(sro) {
        return system.routeDict[sro.routeID].name + " : " + system.routeDict[sro.routeID].stopDict[sro.stopID].name;
    };

    function aStar() {
        _(startNodes).each(function(n) {
            set(openset, n, n);
            set(gScores, n, 0);
            set(fScores, n, heuristic(n));
        });
        var f = function(k) {
            return fScores[k];
        };

        // continue checking until goalnode is expanded
        while (_.keys(openset).length) {
            var current = openset[_.min(_(openset).keys(), f)];
            if (current.stopID === goalNode.stopID) {
                return reconstructPath(current);
            }

            delete(openset[current.stopID + "," + current.routeID]);
            set(closedset, current, current);

            var neighbors = system.neighborNodes(current.stopID, current.routeID); //4
            _(neighbors).each(function(neighbor) {
                if (get(closedset, neighbor)) {
                    return; // equivalent to a loop continue
                } else {
                    var tentativeGScore = get(gScores, current) + neighbor.distToNeighbor; // latter = dist(current, neighbor)
                    if (!get(openset, neighbor) || tentativeGScore < get(gScores, neighbor)) {
                        set(openset, neighbor, neighbor);
                        set(cameFrom, neighbor, current);
                        set(gScores, neighbor, tentativeGScore);
                        set(fScores, neighbor, tentativeGScore + heuristic(neighbor));
                    }
                }
            });
        }
    }
    var res = aStar();
    // NOW CONVERT A-STAR OUTPUT FORMAT TO ROUTE / STOPS OUTPUT FORMAT
    if (!res || res.length === 0) return 'FAIL';
    var ret = [];
    var curRoute;
    _(res).each(function(sro) {
        if (!curRoute || sro.routeID !== curRoute.id) {
            curRoute = _.clone(system.routeDict[sro.routeID]);
            curRoute.stops = [];
            ret.push(curRoute);
        }
        curRoute.stops.push(curRoute.stopDict[sro.stopID]);
    });
    return ret;
};
// BIG TODO: Change everything to be dicts indexed by ids rather than lists
//sures-
/**
 * For all stops in system, If they are in same route, give them smeroutedistance, else if they are same stops in different routes give them transferDistance
 * @param  {[int]} stopID  [osmid of stop node]
 * @param  {[int]} routeID [osmid of route relation]
 * @return {[neighborNodes]}         [List of neighborNodes which have attributes routeID, stopID and distance to current stop]
 */
YY.System.prototype.neighborNodes = function(stopID, routeID) {
    var thisRoute = _.find(this.routes, function(r) {
        return r.id === routeID;
    });
    var sameRouteDistance = 1;
    var transferDistance = 5;
    var neighbors = [];
    _.each(thisRoute.stops, function(s, idx) {
        if (s.id === stopID) {
            if (idx < thisRoute.stops.length - 1) // not the end of list
                neighbors.push({
                    routeID: thisRoute.id,
                    distToNeighbor: sameRouteDistance,
                    stopID: thisRoute.stops[idx + 1].id
                });
            /*else if (thisRoute.isCyclical) // end of list on cyclical route
                neighbors.push({routeID: thisRoute.id, distToNeighbor: sameRouteDistance,
                    stopID: thisRoute.stops[0].id});
            */

            //if (!thisRoute.isDirectional) {
            if (idx > 0)
                neighbors.push({
                    routeID: thisRoute.id,
                    distToNeighbor: sameRouteDistance,
                    stopID: thisRoute.stops[idx - 1].id
                });


            /*else if (thisRoute.isCyclical)
                    neighbors.push(_.extend(templateObj,
                        {stopID: _.last(thisRoute.stops).id}));
            */
            //}
        }
    });
    _.each(this.routes, function(r) {
        if (r.id !== routeID && _.find(r.stops, function(s) {
            return s.id === stopID;
        }))
            neighbors.push({
                routeID: r.id,
                stopID: stopID,
                distToNeighbor: transferDistance
            });
    });
    // while(_.keys(neighbors).length){
    // console.dir("neighbours are"+neighbors.distToNeighbor);
    // }
    return neighbors;
};
//create route from id,stops,segments,tag and startSegID (mainly from overpassed file)
YY.Route = function(id, stops, segments, tag, startSegID) {
    // console.log("creats the route");
    this.id = id;
    this.stops = stops;
    this.segments = segments;
    this.tag = tag;
    this.name = tag.name;
    this.ref = tag.ref;
    this.transport = tag.route;
    // if (!tag.ref){
    //     debugger;
    // }
    //this.orientingSegmentID = orientingSegmentID;
    if (startSegID) {
        this.order(startSegID);
    } else {
        this._unconnectedSegments = this.segments;
        this._noTerminus = true;
    }
    this.deriveStopDict(); // note: this must happen after the order call
};



//derive the Stop Dictionay with all stops of the route
YY.Route.prototype.deriveStopDict = function() {
    var stopDict = {};
    _(this.stops).each(function(s) {
        stopDict[s.id] = s;
    });
    this.stopDict = stopDict;
};
//haversian formula for calculating geographical distance( in meters) between two geographical points
function distanc(lat1, lon1, lat2, lon2) {
    var R = 6371000; // m
    var d = Math.acos(Math.sin(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(lon2 * Math.PI / 180 - lon1 * Math.PI / 180)) * R;
    return d;
}

var distanceForObjLL = function(ll1, ll2) { //return Math.pow(ll1.lat - ll2.lat, 2) + Math.pow(ll1.lng - ll2.lng, 2); 
    return distanc(ll1.lat, ll1.lng, ll2.lat, ll2.lng);
};

//distance for Array of Two points
var distanceForArrLL = function(ll1, ll2) { //return Math.pow(ll1[0] - ll2[1], 2) + Math.pow(ll1[0] - ll2[1], 2); 
    return distanc(ll1[0], ll1[1], ll2[0], ll2[1]);
};

YY.Route.prototype.order = function(startSegID) {
    return this.order_(startSegID);
}
//take the start segID and create the tree structure using the KDTree function/algorithm
YY.Route.prototype.order_ = function(orientingSegmentID) {
    var route = this;
    var segmentOrderDict = {};

    // find orienting way
    var stops = [];
    var n = 0;
    var startSegment = _.find(route.segments, function(seg) {
        return seg.id === orientingSegmentID;
    });
    if (!startSegment) {
        return;
    }

    var llToObj = function(ll, seg) {
        return {
            lat: ll[0],
            lng: ll[1],
            seg: seg
        };
    }

    // kd-tree consisting of the 'start-endpoints' of a segment
    var startKDTree = new kdTree(_.map(route.segments, function(seg) {
            return llToObj(seg.listOfLatLng[0], seg);
        }),
        distanceForObjLL, ["lat", "lng"]);
    // kd-tree consisting of the 'end-endpoints' of a segment
    var endKDTree = new kdTree(_.map(route.segments, function(seg) {
            return llToObj(_.last(seg.listOfLatLng), seg);
        }),
        distanceForObjLL, ["lat", "lng"]);

    /**
     * find, among all the 'start' and 'end' points in other segments, what the closest endpoint is
     and then put it in the segmentOrderObj, which is a linked list in the form on an obj 
     (segmentOrderDict[seg.id]) == followingSeg.id, where followingSeg is the segment that should be after seg
     * @param  {segment} thisSegment [description]
     * @param  {string} end         ["first" or null]
     * @return {[type]}             [description]
     * variables info:
     *     nextFwdTreeCnxn -> segment.id
     *     nextBwdTreeCnxn -> segment.id
     */
    function closestSegment(thisSegment, end) {
        var ret, segmentEnd;
        if (end === 'first') {
            segmentEnd = thisSegment.listOfLatLng[0];
        } else { // also the default
            segmentEnd = _.last(thisSegment.listOfLatLng);
        }

        ret = startKDTree.nearest(llToObj(segmentEnd, thisSegment), 2);
        var nextFwdTreeCnxn = _.min(ret, function(r) {
            if (r[0].seg.id == thisSegment.id) return 999999;
            else return r[1];
        });
        ret = endKDTree.nearest(llToObj(segmentEnd, thisSegment), 2);
        var nextBwdTreeCnxn = _.min(ret, function(r) {
            if (r[0].seg.id == thisSegment.id) return 999999;
            else return r[1];
        });

        var cnxnChanger = (end === 'first') ? {
            'fwd': 'bwd',
            'bwd': 'fwd'
        } : {
            'fwd': 'fwd',
            'bwd': 'bwd'
        };

        if (nextFwdTreeCnxn[1] < nextBwdTreeCnxn[1]) {
            segmentOrderDict[thisSegment.id] = nextFwdTreeCnxn[0].seg;
            return {
                nextSeg: nextFwdTreeCnxn[0].seg,
                sqDist: nextFwdTreeCnxn[1],
                cnxn: cnxnChanger['fwd']
            };
        } else {
            segmentOrderDict[thisSegment.id] = nextBwdTreeCnxn[0].seg;
            return {
                nextSeg: nextBwdTreeCnxn[0].seg,
                sqDist: nextBwdTreeCnxn[1],
                cnxn: cnxnChanger['bwd']
            };
        }
    }

    function recurse(thisSegment, flipped) {
        if (n === route.segments.length) return;
        n = n + 1;

        if (flipped) {
            thisSegment.listOfLatLng.reverse();
            thisSegment.orderedListofStops.reverse();
        }
        stops = stops.concat(thisSegment.orderedListofStops);

        var next = closestSegment(thisSegment);
        if (next.cnxn === 'fwd') {
            recurse(next.nextSeg, false);
        } else {
            recurse(next.nextSeg, true);
        }
    }
    var fwdFacing = closestSegment(startSegment);
    var bwdFacing = closestSegment(startSegment, 'first'); // nearest to first node = bwd facing

    if (fwdFacing.sqDist < bwdFacing.sqDist) {
        recurse(startSegment, false);
    } else {
        recurse(startSegment, true);
    }

    this.stops = _.map(stops, function(s) {
        return new YY.Stop(s.id, s.lat, s.lng, s.tag);
    });
    // TODO: refactor to remove this line, a stopgap measure which removes duplicates
    this.stops = _(this.stops).uniq(false, function(o) {
        return o.id;
    })

    if (_.keys(segmentOrderDict).length === 0) {
        this._unconnectedSegments = this.segments;
    } else if (_.keys(segmentOrderDict).length !== route.segments.length) { // TODO: do this only in debug mode
        var connectedSegmentIds = _.keys(segmentOrderDict)
        var connectedSegments = _(this.segments).filter(function(s) {
            return _(connectedSegmentIds).find(function(id) {
                return s.id === id;
            })
        });
        this._unconnectedSegments = _.difference(this.segments, connectedSegments);
    } else {
        this._unconnectedSegments = [];
    }
};
//create Stop obj with following propries id,lat,long and tag
YY.Stop = function(id, lat, lng, tag) {
    this.id = id;
    this.lat = lat;
    this.lng = lng;
    this.tag = tag;
    this.name = tag.name;
};

YY.Segment = function(id, listOfLatLng, listofnodeids, dictofnodes, tag, orderedStops) {
    this.id = id;
    this.listOfLatLng = listOfLatLng;
    this.listofnodeids = listofnodeids;
    this.dictofnodes = dictofnodes
    this.tag = tag;
    this.orderedListofStops = orderedStops; // intermediarily needed
};

/**
 * 1) Load the config file
 * 2) Load the data as stated in config file
 * 3) If loading data is successful, envoke the callback which means starting he system.
 
 * @param  file_url   config_path
 * @param  callback function cb
 * @return none
 */
YY.fromConfig = function(config_path, cb) {
    // step 1
    // console.profile("parsing xml");
    // console.time("parsing xml");
    $.getJSON(config_path, {}, function(conf) {
        // blend in the conf to the YY namespace
        for (var key in conf) {
            YY[key] = conf[key];
        }
        // load in & parse XML
        // console.log('cb',cb);
        map.spin(true);
        // step 2
        $.ajax({
            type: YY.GET_OR_POST,
            url: YY.API_URL,
            data: YY.QUERY_STRING,
            dataType: "text",
            // step 3
            success: function(overpassXML) {
                // convert xml to system object
                system = YY.fromOSM(overpassXML);
                // console.timeEnd("parsing xml");
                // console.profileEnd("parsing xml");
                map.spin(false);
                cb(system);
            }
        });
    });
};
YY.Segment.prototype.flip = function() {
    this.listOfLatLng = _(this.listOfLatLng).reverse();
    this.orderedListofStops = _(this.orderedListofStops).reverse();
}

/**
 * Converts a file containing routes in osm xml format to a yatayat based system
 * 1) process all the returned nodes; put them in local nodes obj
 * 2) put all ways from overpass into local segments obj + stopToSegDict
 *
 * @param  xml_data_type overpassXML
 * @return system
 */
YY.fromOSM = function(overpassXML) {
    var nodes = {}; // nodes object referenced by id
    var segments = {}; // ways object referenced by id
    var routeStops = {};
    var stopToSegDict = {}; // stopid references which seg it lies on

    /**
     * Converts tags to dict
     * @param  {xml element} tag list with k v pair
     * @return {tag object}
     */
    var tagToObj = function(tag) {
        tags = {};
        _.each(tag, function(t) {
            var $t = $(t);
            tags[$t.attr('k')] = $t.attr('v');
        });
        return tags;
    };

    var $overpassXML = $(overpassXML); //dont know what it does

    /* Step 1: process all the returned nodes; put them in local nodes obj referenced by nodeid */
    _.each($overpassXML.find('node'), function(n) {
        var $n = $(n);
        var tagObj = tagToObj($n.find('tag'));
        nodes[$n.attr('id')] = {
            id: $n.attr('id'),
            lat: $n.attr('lat'),
            lng: $n.attr('lon'),
            tag: tagObj,
            is_stop: tagObj.public_transport === 'stop_position'
        };
    });

    /* Step 2: put all ways from overpass into local segments obj + stopToSegDict */
    _.each($overpassXML.find('way'), function(w) {
        var $w = $(w);
        var myNodes = [];
        var myNodesids = [];
        var myStops = [];
        var mydictofnodes = {};
        _.each($w.find('nd'), function(n) {
            var node = nodes[$(n).attr('ref')];
            if (node.is_stop) {
                myStops.push(node);
                if (!stopToSegDict[node.id])
                    stopToSegDict[node.id] = [];

                stopToSegDict[node.id].push($w.attr('id'));
            }
            myNodes.push([node.lat, node.lng]);
            myNodesids.push(node.id);
            mydictofnodes[node.id] = node;
        });
        // At this point, myNodes = ordered list of nodes in this segment, myStops = ordered list of stops
        segments[$w.attr('id')] = new YY.Segment($w.attr('id'), myNodes, myNodesids, mydictofnodes, tagToObj($w.find('tag')), myStops);
    });


    /* Step 3: */
    var routes = _.map($overpassXML.find('relation'), function(r) {
        var $r = $(r);
        var mySegments = [];
        var startStop, startSegID;

        _.each($r.find('member'), function(m) {
            var $m = $(m);
            if ($m.attr('type') === 'way') {
                var segment = segments[$m.attr('ref')];
                segment.role = $m.attr('role');
                mySegments.push(segment);
            } else if ($m.attr('type') === 'node') {
                var n = nodes[$m.attr('ref')];
                if (n && n.lat && n.lng) {
                    var stop = new YY.Stop($m.attr('ref'), n.lat, n.lng, n.tag);
                    if ($m.attr('role') === 'terminus' || $m.attr('role') === 'start') {
                        startStop = stop;
                        n.is_start = true;
                    }
                }
            }
        });
        var startSegID = startStop && _.find(stopToSegDict[startStop.id], function(segID) {
            return _.contains(_.pluck(mySegments, 'id'), segID);
        })
        return new YY.Route($r.attr('id'), [], mySegments, tagToObj($r.find('tag')), startSegID);
    });

    // Filter out hiking routes
    routes = routes.filter(function(x) {
        return x.transport !== "hiking";
    });

    return new YY.System(routes, stopToSegDict);
}

YY.render_ = function(system, map, includeIDDict, leafletBaseOptions, leafletOverrideOptions) {
    if (!YY._layerGroup) {
        YY._layerGroup = new L.LayerGroup();
    }
    YY._layerGroup.clearLayers();
    if (!YY._routeGroup) {
        YY._routeGroup = new L.LayerGroup();
    }
    if (YY._singlelayer) {
        YY._singlelayer.clearLayers();
    }

    var filteredSystem = system.prune(includeIDDict);
    var defaultOptions = {
        "route": function() {
            return {
                color: '#FCCC1E',
                opacity: 1,
                weight: 4
            };
        },
        "stop": {
            color: '#378AAD',
            fillOpacity: 0.5,
            radius: 5
        }
    };
    // render the route as a multi-polyline
    _(filteredSystem.routes).each(function(route) {
        route.segments.forEach(function(seg) {
            var segMPL = new L.Polyline(
                _.map(seg.listOfLatLng, function(LL) {
                    return new L.LatLng(LL[0], LL[1]);
                }), (leafletBaseOptions && leafletBaseOptions.route) ||
                defaultOptions.route());
            segMPL.bindPopup(route.name);
            YY._layerGroup.addLayer(segMPL);
        });
    });
    // render the stops as circle markers 
    _(filteredSystem.routes).each(function(route) {
        route.stops.forEach(function(stop) {
            if (includeIDDict && !(stop.id in includeIDDict)) return;
            var Lll = new L.LatLng(stop.lat, stop.lng);
            var marker;
            if (leafletOverrideOptions && (stop.id in leafletOverrideOptions)) {
                marker = new L.marker(Lll, {
                    icon: L.divIcon({
                        html: stop.name
                    })
                });
            } else {
                marker = new L.marker(Lll, {
                    icon: L.icon({
                        iconUrl: 'bus.png',
                        iconSize: [18, 18],
                        iconAnchor: [9, 9]
                    }),
                    title: stop.name,
                    riseOnHover: true
                }).addTo(map);
            }
            marker.bindPopup(stop.name + "</br><a href='#' onclick='document.getElementById(\"startstop\").value=\"" + stop.name + "\";$(\"#startstop\").change()'>From Here</a>" + "</br><a href='#' onclick='document.getElementById(\"endstop\").value=\"" + stop.name + "\";$(\"#endstop\").change()'>To Here</a>");
            YY._layerGroup.addLayer(marker);
        });
    });
    map.removeLayer(YY._layerGroup);
    map.addLayer(YY._layerGroup);
};


// COLORS MODULE
var colors = (function() {
    var colors = {};
    var colorschemes = {
        proportional: {
            // http://colorbrewer2.org/index.php?type=sequential
            "Set1": ["#EFEDF5", "#DADAEB", "#BCBDDC", "#9E9AC8", "#807DBA", "#6A51A3", "#54278F", "#3F007D"],
            "Set2": ["#DEEBF7", "#C6DBEF", "#9ECAE1", "#6BAED6", "#4292C6", "#2171B5", "#08519C", "#08306B"]
        }
    };
    var defaultColorScheme = "Set1";

    function select_from_colors(type, colorscheme, zero_to_one_inclusive) {
        var epsilon = 0.00001;
        colorscheme = colorscheme || defaultColorScheme;
        var colorsArr = colorschemes[type][colorscheme];
        return colorsArr[Math.floor(zero_to_one_inclusive * (colorsArr.length - epsilon))];
    }

    // METHODS FOR EXPORT
    colors.getNumProportional = function(colorscheme) {
        colorscheme = colorscheme || defaultColorScheme;
        return colorschemes.proportional[colorscheme].length;
    };
    colors.getProportional = function(zero_to_one, colorscheme) {
        return select_from_colors('proportional', colorscheme, zero_to_one);
    };

    return colors;
}());

YY.single_route_render = function(system, route) {
    var rt_bd = new L.LatLngBounds();
    _(route.stops).each(function(s) {
        var latlngg = new L.LatLng(s.lat, s.lng);
        rt_bd.extend(latlngg);
    });

    if (YY._routeGroup) {
        YY._routeGroup.clearLayers();
    }
    $('#routedisplay').hide();

    if (YY._singlelayer) {
        YY._singlelayer.clearLayers();
    } else {
        YY._singlelayer = new L.LayerGroup();
    }
    _.each(route.segments, function(seg, idx) {
        var latlngs = seg.listOfLatLng.map(function(LL) {
            return new L.LatLng(LL[0], LL[1]);
        });
        var poly = new L.Polyline(latlngs, {
            color: 'green',
            weight: 7
        });
        poly.bindPopup("<a href='http://www.openstreetmap.org/browse/way/" + seg.id + "' target='_blank'>" + seg.id + "</a>");

        var arrow = new L.polylineDecorator(poly, {
            patterns: [{
                offset: 25,
                repeat: 50,
                symbol: L.Symbol.arrowHead({
                    pixelSize: 15,
                    pathOptions: {
                        fillOpacity: 1,
                        weight: 0
                    }
                })
            }]
        });

        YY._singlelayer.addLayer(arrow);
        YY._singlelayer.addLayer(poly);
    });
    route.stops.forEach(function(stop) {
        var marker;
        var ll = new L.LatLng(stop.lat, stop.lng);
        marker = new L.marker(ll, {
            icon: L.divIcon({
                html: stop.name
            })
        });
        YY._singlelayer.addLayer(marker);
    });
    map.addLayer(YY._singlelayer);
    map.fitBounds(rt_bd);
    return YY._singlelayer;
};

// selectively export as a node module
var module = module || {};
module.exports = YY;