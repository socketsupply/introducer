#! /bin/bash

#SEED=$(date +%s%N)
MAX=${MAX:-100}

run () {
  SEED=$(date +%s%N)
  C=0
  #SEED=RANDOM_SEED_$C
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
      CONTINUE=0
    fi
    if test $C -ge $MAX; then
      CONTINUE=0
      echo
    fi
    SEED=$(date +%s%N)
    C=$(($C+1))
  done

  echo 
}
#echo SEED=$SEED node $1

all () {
  for R in test/*.js; do
    if [[ "$R" == "${R#test/z}" ]]; then
      run $R
    fi
  done
}

"$@"