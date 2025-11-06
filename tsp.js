// tsp.js (Node module) - Nearest Neighbor + 2-Opt
function euclidean(a, b, floorPenalty = 20.0) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  let d = Math.hypot(dx, dy);
  if ((a.floor || 0) !== (b.floor || 0)) d += floorPenalty;
  return d;
}

function makeDistMatrix(points, floorPenalty = 20.0) {
  const n = points.length;
  const dist = Array.from({length:n}, () => Array(n).fill(0));
  for (let i=0;i<n;i++) for (let j=0;j<n;j++){
    if (i===j) continue;
    dist[i][j] = euclidean(points[i], points[j], floorPenalty);
  }
  return dist;
}

function nearestNeighbor(dist) {
  const n = dist.length;
  const visited = Array(n).fill(false);
  const route = [0]; visited[0] = true; // assume start index 0
  for (let step=1; step<n; step++){
    const last = route[route.length-1];
    let best = -1, bestD = Infinity;
    for (let j=0;j<n;j++) if (!visited[j] && dist[last][j] < bestD){
      best = j; bestD = dist[last][j];
    }
    route.push(best); visited[best] = true;
  }
  return route;
}

function routeLength(route, dist, returnToStart=true){
  let s=0;
  for (let i=0;i<route.length-1;i++) s += dist[route[i]][route[i+1]];
  if (returnToStart) s += dist[route[route.length-1]][route[0]];
  return s;
}

function twoOpt(route, dist, maxIter=1000, returnToStart=true){
  let best = route.slice();
  let bestLen = routeLength(best, dist, returnToStart);
  const n = route.length;
  let iter=0, improved=true;
  while (improved && iter++ < maxIter){
    improved = false;
    for (let i=1;i<n-2;i++){
      for (let k=i+1;k<n-1;k++){
        const newRoute = best.slice(0,i).concat(best.slice(i,k+1).reverse(), best.slice(k+1));
        const newLen = routeLength(newRoute, dist, returnToStart);
        if (newLen + 1e-9 < bestLen){
          best = newRoute; bestLen = newLen; improved = true;
        }
      }
    }
  }
  return {route: best, length: bestLen};
}

// Example usage:
function solveTSP(points, options = {}) {
  // points: [{id,x,y,floor}, ...], index 0 is depot/start
  const floorPenalty = options.floorPenalty || 20.0;
  const returnToStart = options.returnToStart ?? true;
  const dist = makeDistMatrix(points, floorPenalty);
  const init = nearestNeighbor(dist);
  const improved = twoOpt(init, dist, options.maxIter || 500, returnToStart);
  // return both indices and mapped ids
  return {
    orderedIdx: improved.route,
    ordered: improved.route.map(i => points[i].id), 
    length: improved.length
  };
}

module.exports = { solveTSP };
