#! /bin/bash

#SEED=$(date +%s%N)
MAX=${MAX:-100}

next_seed () {
  SEED=$C #date +%s%N)  
}

run () {
  C=0
  SEED=$C #date +%s%N)
  #SEED=RANDOM_SEED_$C
  next_seed
  CONTINUE=1

  echo "# TEST $1"
  while test $CONTINUE == 1 ; do
    if SEED=$SEED node $1 > /dev/null 2> /dev/null; then
      echo -e -n "\r# passed $C SEED=$SEED"
    else
      echo
      echo "# !!! $1 FAILED after $C runs"
      echo
      echo SEED=$SEED node $1 1>&2
      echo
      return 1
    fi
    if test $C -ge $MAX; then
      echo
      return 0
    fi
    SEED=$C #date +%s%N)  
#    SEED=$(date +%s%N)
    C=$(($C+1))
  done

  echo 
}
#echo SEED=$SEED node $1

all () {
  failures=0
  for R in test/*.js; do
    if [[ "$R" == "${R#test/z}" ]]; then
      if run $R; then
        echo
      else
        failures=$(($failures+1))
      fi
    fi
  done
  exit $failures
}

"$@"