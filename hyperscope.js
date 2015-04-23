
// Hyperscope
// Upgrading $scope.$watch, making new friends

angular.module('hyperscope', [])

// service for extending $scope objects
.service('hyperscope', ['$parse', function($parse){
  var vanillaAdditions = {

    // Apply only if angular is not already doing so.
    $applyWithCare: function(fn){
      if(_.contains(['$apply','$digest'], this.$root.$$phase)){
        typeof fn == 'string' ? $parse(fn)(this) : fn();
      } else {
        this.$apply(fn);
      }
    },

    // Like $watch, but assigns the value of `expression` to `this[`alias`]`
    $alias: function(expr, alias, objectEquality){
      return this.$watch(expr, function(val, old, scope){
        scope[alias] = val;
      }, objectEquality);
    },
    $expr: function(expr, objectEquality){
      return this.$watch(expr, function(){}, objectEquality);
    }
  };

  var upgradeable = {
    // Like $watch, but only runs when the watch expression's new value
    // is truthy.
    $if: function(expr, fn, objectEquality){
      return this.$watch(expr, function(is, was, scope){
        if(!is) return true;
        return fn(is, was, scope);
      }, objectEquality);
    }
  };

  /* Upgrade watchHelpers (currently, $watch and $if)
   *
   *  - accept an angular expression as a listener
   *  - $watch(...).once() to deregister after one invocation
   *  - $watch(...).times(n) to deregister after N invocations
   *
   *  MIND-BLOW: $watch supports this by default, but it's undocumented
   *  and a comment in the source suggests it may disappear. Leaving it
   *  here for now, but worth noting that it's a native feature.
   */
  var upgradeWatchHelper = function(obj, funcName){
    var unwrappedWatcher = obj[funcName];

    // keep the original around: eg., $watch -> $$watch
    obj['$' + funcName] = unwrappedWatcher;

    obj[funcName] = function(expr, _fnOrExpr, _objectEq, _exprCtx){
      var objectEq = _objectEq,
          exprCtx = _exprCtx || this; // object against which fnOrExpr is evald

      // TODO dont cop out on this case.
      // Handle the $watch(fn) form.
      if(typeof expr == "function")
        return unwrappedWatcher.call(this, expr, _fnOrExpr);

      // handle the short function signature:
      // $watch(expr, expr, exprCtx)
      if(typeof objectEq == 'object')
        exprCtx = objectEq, objectEq = false;

      // xform callback expression to function
      var fn = typeof _fnOrExpr == 'string'
             ? function(newV, oldV, scope){
               exprCtx.$oldVal = oldV;
               exprCtx.$newVal = newV;
               return $parse(_fnOrExpr)(exprCtx);
             }
             : _fnOrExpr;

      // Wrap the callback so we can capture and use its return value
      // to determine whether or not to count that invocation against
      // the max invocations.
      var deregister;
      var maxInvocations = 0;
      var numInvocations = 0;
      var debug = angular.noop;
      var callback = function(n, o, s){
        // If `fn` returns true, do not count this invocation against the count.
        // This is useful for implementing $if(...).once(), which should not be
        // deregistered if its listener is triggered by a falsy expression value.
        var countIt = !fn(n, o, s);
        countIt && numInvocations++;

        debug(n, o, s);
        countIt;

        if(maxInvocations && numInvocations >= maxInvocations){
          deregister();
        }
      };

      deregister = unwrappedWatcher.call(this, expr, callback, objectEq);

      deregister.once = function(){
        maxInvocations = 1;
        return deregister;
      };

      deregister.times = function(n){
        maxInvocations = n;
        return deregister;
      }

      deregister.debug = function(args){
        debug = function(n, o, s){
          console.log(
            s.id,
            expr,
            typeof _fnOrExpr == 'string' ?
               _fnOrExpr :
               'fn',
            n, o
          );
        }
        return deregister;
      };

      return deregister;
    };
  };

  _.keys(upgradeable).map(function(key){
    upgradeWatchHelper(upgradeable, key);
  });

  // the final set of additions to the $scope object
  var extensions = _.extend({}, _.extend(upgradeable, vanillaAdditions));

  return function(scopeOrProto){
    _.extend(scopeOrProto, extensions);
    upgradeWatchHelper(scopeOrProto, '$watch');
    return scopeOrProto;
  };
}]);